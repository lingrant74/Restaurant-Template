const express = require("express");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const prisma = require("./prismaClient");

const authRouter = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const sessionCookieName = "restaurant_admin_session";
const roles = {
  platformAdmin: "PLATFORM_ADMIN",
  restaurantUser: "RESTAURANT_USER"
};
const unapprovedRestaurantUserMessage = "Your account is not approved yet. Ask the platform admin to link your email to a restaurant.";

function isAdminAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_AUTH_BYPASS === "true";
}

function getDevelopmentAdminUser() {
  return {
    email: "dev-admin@example.com",
    name: "Development Admin",
    picture: null,
    role: roles.platformAdmin
  };
}

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  return "development-only-restaurant-admin-secret";
}

function getApprovedAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  };
}

function buildClearCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  };
}

function createSessionUser(payload) {
  const user = {
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || null,
    role: payload.role
  };

  if (payload.restaurantId) {
    user.restaurantId = payload.restaurantId;
  }

  return user;
}

function getSessionUser(req) {
  const token = req.cookies?.[sessionCookieName];

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  if (isAdminAuthBypassEnabled()) {
    req.adminUser = getDevelopmentAdminUser();
    return next();
  }

  const user = getSessionUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Admin login required"
    });
  }

  req.adminUser = user;
  next();
}

function requirePlatformAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.adminUser.role !== roles.platformAdmin) {
      return res.status(403).json({
        error: "Platform admin access required"
      });
    }

    next();
  });
}

function requireRestaurantAccess(paramName = "restaurantId") {
  return function restaurantAccessMiddleware(req, res, next) {
    requireAuth(req, res, () => {
      if (req.adminUser.role === roles.platformAdmin) {
        return next();
      }

      const restaurantId = Number(req.params[paramName]);

      if (req.adminUser.role === roles.restaurantUser && Number(req.adminUser.restaurantId) === restaurantId) {
        return next();
      }

      return res.status(403).json({
        error: "You do not have access to this restaurant"
      });
    });
  };
}

function requireOrderAccess() {
  return async function orderAccessMiddleware(req, res, next) {
    requireAuth(req, res, async () => {
      try {
        if (req.adminUser.role === roles.platformAdmin) {
          return next();
        }

        const orderId = Number(req.params.orderId);

        if (!Number.isInteger(orderId)) {
          return res.status(400).json({
            error: "Order id must be a number"
          });
        }

        const order = await prisma.order.findUnique({
          where: {
            id: orderId
          },
          select: {
            restaurantId: true
          }
        });

        if (!order) {
          return res.status(404).json({
            error: "Order not found"
          });
        }

        if (req.adminUser.role === roles.restaurantUser && Number(req.adminUser.restaurantId) === order.restaurantId) {
          return next();
        }

        return res.status(403).json({
          error: "You do not have access to this order"
        });
      } catch (err) {
        next(err);
      }
    });
  };
}

authRouter.post("/api/auth/google", async (req, res, next) => {
  try {
    const { credential } = req.body;

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        error: "Google sign-in is not configured. Add GOOGLE_CLIENT_ID to .env."
      });
    }

    if (!credential) {
      return res.status(400).json({
        error: "Google credential is required"
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const approvedAdminEmails = getApprovedAdminEmails();

    if (!email || !payload.email_verified) {
      return res.status(401).json({
        error: "Google account email could not be verified"
      });
    }

    let user;

    if (approvedAdminEmails.includes(email)) {
      user = createSessionUser({
        email,
        name: payload.name,
        picture: payload.picture,
        role: roles.platformAdmin
      });
    } else {
      const restaurantUser = await prisma.restaurantUser.findUnique({
        where: {
          email
        }
      });

      if (!restaurantUser) {
        return res.status(403).json({
          error: unapprovedRestaurantUserMessage
        });
      }

      if (restaurantUser.status !== "APPROVED") {
        return res.status(403).json({
          error: unapprovedRestaurantUserMessage,
          status: restaurantUser.status
        });
      }

      await prisma.restaurantUser.update({
        where: {
          id: restaurantUser.id
        },
        data: {
          name: payload.name || restaurantUser.name,
          picture: payload.picture || restaurantUser.picture
        }
      });

      user = createSessionUser({
        email,
        name: payload.name || restaurantUser.name,
        picture: payload.picture || restaurantUser.picture,
        role: roles.restaurantUser,
        restaurantId: restaurantUser.restaurantId
      });
    }

    if (!user) {
      return res.status(403).json({
        error: "This Google account is not approved"
      });
    }

    const token = jwt.sign(user, getJwtSecret(), {
      expiresIn: "7d"
    });

    res.cookie(sessionCookieName, token, buildCookieOptions());
    res.json({
      user
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/api/auth/me", (req, res) => {
  res.json({
    user: isAdminAuthBypassEnabled() ? getDevelopmentAdminUser() : getSessionUser(req)
  });
});

authRouter.post("/api/auth/logout", (req, res) => {
  res.clearCookie(sessionCookieName, buildClearCookieOptions());
  res.json({
    message: "Logged out"
  });
});

module.exports = {
  authRouter,
  requireAuth,
  requirePlatformAdmin,
  requireRestaurantAccess,
  requireOrderAccess,
  roles
};
