export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top-row">
          <div className="footer-brand-block">
            <span className="footer-brand-mark">LABLINE</span>
            <p className="footer-brand-desc">
              Real-time help desk and doubt resolution queue for university computer laboratories and engineering workshops.
            </p>
          </div>

          <div className="footer-columns-group font-mono">
            <div className="footer-col">
              <span className="footer-col-title">OVERVIEW</span>
              <a href="#lifecycle" className="footer-link">Lifecycle</a>
              <a href="#workflows" className="footer-link">Workspaces</a>
              <a href="#problem" className="footer-link">Problem Space</a>
              <a href="#specs" className="footer-link">Architecture</a>
            </div>

            <div className="footer-col">
              <span className="footer-col-title">SYSTEM</span>
              <span className="footer-meta-item">Status: Operational</span>
              <span className="footer-meta-item">Region: Singapore</span>
              <span className="footer-meta-item">TLS 1.3 Strict</span>
              <span className="footer-meta-item">Host: Render Free</span>
            </div>

            <div className="footer-col">
              <span className="footer-col-title">INFRASTRUCTURE</span>
              <span className="footer-meta-item">Budget: $0.00 / mo</span>
              <span className="footer-meta-item">Sockets: Real-time duplex</span>
              <span className="footer-meta-item">Storage: MongoDB Atlas</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom-bar font-mono">
          <div className="footer-bottom-left">
            <span>LABLINE COLLEGE HELP DESK</span>
            <span className="footer-sep">·</span>
            <span>NO EXTERNAL RUNTIME FONT CALLS</span>
            <span className="footer-sep">·</span>
            <span>ZERO CLIENT TRACKING COOKIES</span>
          </div>
          <div className="footer-bottom-right">
            <span>© 2026 LABLINE. ALL RIGHTS RESERVED.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
