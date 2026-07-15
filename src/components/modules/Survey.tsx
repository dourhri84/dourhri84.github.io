import { ModulePage } from "../layout/ModulePage";

const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScmxUqU3yKadeHS0t0j8jhLeUv4EA1GAnX13SQYx2cmdCV6yg/viewform";

export function SurveyPage() {
  return (
    <ModulePage
      title="Survey / Feedback"
      description="A short satisfaction survey — tell us what worked and what didn't. Responses are collected directly via Google Forms."
      canvas={
        <iframe
          src={`${GOOGLE_FORM_URL}?embedded=true`}
          title="CassLab Survey"
          width="100%"
          height="1200"
          style={{ border: "none", borderRadius: 8, display: "block" }}
        >
          Loading…
        </iframe>
      }
      panel={
        <div>
          <h4>Trouble seeing the form?</h4>
          <p className="hint">
            Some networks block embedded third-party forms. If the survey above doesn't load, open it
            directly instead:
          </p>
          <a
            className="btn"
            href={GOOGLE_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}
          >
            Open survey in a new tab
          </a>
        </div>
      }
    />
  );
}
