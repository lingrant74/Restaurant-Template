import { Link } from "react-router-dom";
import LegalFooter from "../components/LegalFooter.jsx";
import { legalContent } from "../legalContent.js";

export default function LegalPage({ type }) {
  const content = legalContent[type] || legalContent.terms;

  return (
    <main className="legal-page">
      <header className="legal-page-header">
        <Link to="/" className="legal-back-link">Back to GIGI</Link>
        <p className="eyebrow">Legal</p>
        <h1>{content.title}</h1>
        <p className="legal-updated">{content.lastUpdated}</p>
        <p>{content.intro}</p>
      </header>

      <section className="legal-document">
        {content.sections.map((section) => (
          <article key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        ))}
      </section>

      <LegalFooter variant="legal" />
    </main>
  );
}
