const ASSET = {
  logoWhite:
    "https://storage.googleapis.com/righteous-assets/Righteous%20Gaming%20Logo%20White.png",
  logoBlack:
    "https://storage.googleapis.com/righteous-assets/Righteous%20Gaming%20Logo%20Black.png",
  logoPurple:
    "https://storage.googleapis.com/righteous-assets/Solid%20Purple%20Logo.png",
};

export default function App() {
  return (
    <div className="rg-home">
      <div className="rg-home__bg" aria-hidden="true" />
      <div className="rg-home__overlay" aria-hidden="true" />

      <aside className="rg-home__corner-badge" aria-hidden="true">
        <img src={ASSET.logoPurple} alt="" width={48} height={48} decoding="async" />
      </aside>

      <main className="rg-home__main">
        <img
          className="rg-home__logo"
          src={ASSET.logoWhite}
          alt="Righteous Gaming"
          width={440}
          height={200}
          decoding="async"
          fetchPriority="high"
        />
        <p className="rg-home__eyebrow">Strategy · Pride · Play</p>
        <p className="rg-home__tagline">
          Strategy-first play — sharp minds, clean execution, uncompromising standards.
        </p>
        <div className="rg-home__rule" aria-hidden="true" />
      </main>

      <footer className="rg-home__footer">
        <img
          className="rg-home__footer-logo-img"
          src={ASSET.logoBlack}
          alt="Righteous Gaming"
          width={200}
          height={56}
          decoding="async"
        />
        <p className="rg-home__footer-note">Light-ground lockup</p>
      </footer>
    </div>
  );
}
