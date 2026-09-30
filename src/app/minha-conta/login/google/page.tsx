"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

// Abre o login Google (o next-auth exige um POST com CSRF, por isso uma página cliente).
export default function GoogleLaunchPage() {
  useEffect(() => {
    signIn("google", { callbackUrl: "/api/minha-conta/google/finish" });
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF6EC", fontFamily: "'Poppins',sans-serif", color: "#4A3526" }}>
      Redirecionando para o Google…
    </div>
  );
}
