export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top-row">
          <div className="footer-brand-block">
            <span className="footer-brand-mark">LABLINE</span>
            <p className="footer-brand-desc">
              A simpler way to get help in your university's computer labs.
            </p>
          </div>

          <nav className="footer-nav" aria-label="Footer navigation">
            <a href="#lifecycle" className="footer-nav-link">Lifecycle</a>
            <a href="#problem" className="footer-nav-link">Problem</a>
            <a href="#workflows" className="footer-nav-link">Workspaces</a>
          </nav>
        </div>

        <div className="footer-bottom-bar font-mono">
          <span className="footer-copyright">
            &copy; {currentYear} LabLine. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}
