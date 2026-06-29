const prisma = require("./prismaClient");

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Words to ignore when matching (filler words callers say).
const FILLER = new Set([
  "i", "want", "need", "get", "me", "please", "some", "the",
  "of", "can", "have", "like", "would", "give", "order", "ill", "id",
  "make", "it", "that", "this", "just", "gonna", "go", "for",
]);

/**
 * Parse a spoken sentence into structured menu items.
 * Returns { matchedItems, unmatchedText }.
 */
async function parseVoiceOrder(speechResult, restaurantId) {
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId, isAvailable: true },
  });

  const menu = menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    nameLower: item.name.toLowerCase(),
    nameWords: item.name.toLowerCase().split(/\s+/),
    price: Number(item.price),
  }));

  // Normalize: lowercase, replace separators with commas.
  let text = speechResult.toLowerCase();
  text = text.replace(/\b(and|with|also|plus)\b/g, ",");
  text = text.replace(/[.!?]/g, "");

  const segments = text.split(",").map((s) => s.trim()).filter(Boolean);

  const matchedItems = [];
  const unmatchedSegments = [];

  for (const segment of segments) {
    const { quantity, remaining } = extractQuantity(segment);
    const match = findBestMatch(remaining, menu);

    if (match) {
      const existing = matchedItems.find((m) => m.menuItemId === match.id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        matchedItems.push({
          menuItemId: match.id,
          name: match.name,
          price: match.price,
          quantity,
        });
      }
    } else {
      const meaningful = remaining.split(/\s+/).filter((w) => !FILLER.has(w)).join(" ").trim();
      if (meaningful.length > 0) {
        unmatchedSegments.push(meaningful);
      }
    }
  }

  return {
    matchedItems,
    unmatchedText: unmatchedSegments.join("; ") || null,
  };
}

function extractQuantity(segment) {
  const words = segment.trim().split(/\s+/);

  // Scan through the words to find the first number (skip filler at the start).
  for (let i = 0; i < words.length; i++) {
    // Digit like "2" or "3"
    if (/^\d+$/.test(words[i])) {
      const quantity = parseInt(words[i], 10);
      const remaining = [...words.slice(0, i), ...words.slice(i + 1)].join(" ");
      return { quantity, remaining };
    }
    // Number word like "two" or "a"
    if (NUMBER_WORDS[words[i]] !== undefined) {
      // Skip "a" if it doesn't look like a quantity (e.g. "a" at position 0 before filler).
      // But "a cheese pizza" should work, so only skip "a" if the remaining text is just filler.
      const quantity = NUMBER_WORDS[words[i]];
      const remaining = [...words.slice(0, i), ...words.slice(i + 1)].join(" ");
      return { quantity, remaining };
    }
    // If current word is filler, keep scanning.
    if (FILLER.has(words[i])) continue;
    // Hit a non-filler, non-number word — no quantity found.
    break;
  }

  return { quantity: 1, remaining: segment.trim() };
}

function findBestMatch(text, menu) {
  // Strip filler and pluralize-normalize for matching.
  const words = text.split(/\s+/).filter((w) => !FILLER.has(w));
  const cleaned = words.join(" ");

  if (!cleaned || cleaned.length < 3) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const item of menu) {
    // Exact substring: menu item name appears fully in the spoken text.
    if (cleaned.includes(item.nameLower)) {
      const score = item.nameLower.length * 2;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
      continue;
    }

    // Reverse: spoken text appears fully in the menu item name.
    // e.g., "pepperoni" is inside "pepperoni pizza"
    if (item.nameLower.includes(cleaned) && cleaned.length >= 4) {
      const score = cleaned.length * 1.5;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
      continue;
    }

    // Word overlap: count how many menu item words appear in spoken text.
    // Also check singular/plural variants (e.g., "pizzas" matches "pizza").
    const matchingWords = item.nameWords.filter((menuWord) =>
      words.some((spokenWord) => wordsMatch(spokenWord, menuWord))
    );
    const ratio = matchingWords.length / item.nameWords.length;

    // Require ALL words of the menu item to match for single-word items,
    // or at least 50% for multi-word items.
    const threshold = item.nameWords.length === 1 ? 1.0 : 0.5;
    if (ratio >= threshold) {
      const score = ratio * item.nameLower.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }
  }

  return bestMatch;
}

// Check if two words match, accounting for basic plural forms.
function wordsMatch(spoken, menuWord) {
  if (spoken === menuWord) return true;
  // "pizzas" matches "pizza", "knots" matches "knot"
  if (spoken === menuWord + "s" || spoken === menuWord + "es") return true;
  if (menuWord === spoken + "s" || menuWord === spoken + "es") return true;
  // "salads" → "salad"
  if (spoken.endsWith("s") && spoken.slice(0, -1) === menuWord) return true;
  if (menuWord.endsWith("s") && menuWord.slice(0, -1) === spoken) return true;
  return false;
}

/**
 * Load modifier groups and options for a menu item.
 * Returns an array of groups with their available options.
 */
async function loadItemModifiers(menuItemId) {
  const links = await prisma.menuItemModifierGroup.findMany({
    where: { menuItemId },
    include: {
      modifierGroup: {
        include: {
          options: {
            where: { available: true },
            orderBy: [{ sort: "asc" }, { name: "asc" }],
          },
        },
      },
    },
    orderBy: { modifierGroup: { sort: "asc" } },
  });

  return links.map((link) => ({
    groupId: link.modifierGroup.id,
    groupName: link.modifierGroup.name,
    required: link.modifierGroup.required,
    allowMultiple: link.modifierGroup.allowMultiple,
    minSelections: link.modifierGroup.minSelections,
    maxSelections: link.modifierGroup.maxSelections,
    options: link.modifierGroup.options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      priceDelta: Number(opt.priceDelta),
    })),
  }));
}

module.exports = { parseVoiceOrder, loadItemModifiers };
