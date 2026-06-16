export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Poppins:wght@400;500;600;700&family=Permanent+Marker&display=swap"
        rel="stylesheet"
      />
      <div style={{ minHeight: "100vh", background: "#FBF6EC" }}>{children}</div>
    </>
  );
}
