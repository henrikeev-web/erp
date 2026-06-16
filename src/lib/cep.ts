export interface CepResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  error?: boolean;
}

export async function fetchCep(cep: string): Promise<CepResult | null> {
  const cleaned = cep.replace(/\D/g, "");
  if (cleaned.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;

    return {
      cep: data.cep,
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf,
    };
  } catch {
    return null;
  }
}
