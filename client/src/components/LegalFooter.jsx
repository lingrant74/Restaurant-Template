import { useEffect, useState } from "react";
import { legalContent } from "../legalContent.js";

export default function LegalFooter({ variant = "default" }) {
  const year = new Date().getFullYear();
  const [activeLegalType, setActiveLegalType] = useState(null);
  const activeLegalDocument = activeLegalType ? legalContent[activeLegalType] : null;

  useEffect(() => {
    if (!activeLegalType) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setActiveLegalType(null);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeLegalType]);

  return (
    <>
      <footer className={`legal-footer legal-footer-${variant}`}>
        <div>
          <strong>GIGI</strong>
          <p>&copy; {year} Restaurant Helpers. All rights reserved.</p>
        </div>
        <nav aria-label="Legal links">
          <button className="legal-footer-link" type="button" onClick={() => setActiveLegalType("terms")}>
            Terms
          </button>
          <button className="legal-footer-link" type="button" onClick={() => setActiveLegalType("privacy")}>
            Privacy
          </button>
          <a className="legal-footer-link" href="mailto:hello@getgigi.com">Contact</a>
        </nav>
        <div className="legal-footer-note">
          <p>GIGI helps restaurants manage orders and communications.</p>
          <p>Restaurant operators are responsible for menu accuracy, pricing, taxes, availability, and fulfillment.</p>
        </div>
      </footer>

      {activeLegalDocument && (
        <div className="legal-modal-backdrop" role="presentation" onClick={() => setActiveLegalType(null)}>
          <section
            aria-labelledby="legal-modal-title"
            aria-modal="true"
            className="legal-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="legal-modal-header">
              <div>
                <p className="eyebrow">Legal</p>
                <h2 id="legal-modal-title">{activeLegalDocument.title}</h2>
              </div>
              <button
                aria-label={`Close ${activeLegalDocument.title}`}
                className="legal-modal-close"
                type="button"
                onClick={() => setActiveLegalType(null)}
              >
                &times;
              </button>
            </header>

            <div className="legal-modal-content">
              <p className="legal-updated">{activeLegalDocument.lastUpdated}</p>
              <p className="legal-modal-intro">{activeLegalDocument.intro}</p>
              {activeLegalDocument.sections.map((section) => (
                <article key={section.heading}>
                  <h3>{section.heading}</h3>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
