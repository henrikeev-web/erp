/**
 * NFS-e module for Banguelas — GissOnline / ABRASF 2.04 / São José do Rio Preto SP
 *
 * Fiscal data is loaded from the NfseConfig table (editable via /admin/escola → Configurações).
 * Certificate path & password remain in .env for security:
 *   NFSE_CERT_PATH      path to .pfx file (relative to project root or absolute)
 *   NFSE_CERT_PASSWORD  PFX passphrase
 */

import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import fs from "fs";
import https from "https";
import path from "path";
import axios from "axios";
import { prisma } from "@/lib/prisma";

// ─── Config from DB + env fallback ────────────────────────────────────────────

export interface NfseConfigData {
  cnpj: string;
  im: string;
  razaoSocial: string;
  itemServico: string;
  codTributacao: string;
  aliquotaIss: number;
  ambiente: string;
  wsUrl: string;
  wsHomologUrl: string;
  certPath: string;
  certPassword: string;
}

export async function getNfseConfig(): Promise<NfseConfigData> {
  const db = await (prisma.nfseConfig as any).findUnique({ where: { id: "singleton" } });

  return {
    cnpj:         (db?.cnpj          || process.env.NFSE_PRESTADOR_CNPJ    || "").replace(/\D/g, ""),
    im:           db?.im             || process.env.NFSE_PRESTADOR_IM       || "",
    razaoSocial:  db?.razaoSocial    || process.env.NFSE_PRESTADOR_RAZAO    || "",
    itemServico:  db?.itemServico    || process.env.NFSE_ITEM_SERVICO       || "14.01",
    codTributacao:db?.codTributacao  || process.env.NFSE_CODIGO_TRIBUTACAO  || "",
    aliquotaIss:  db?.aliquotaIss    ?? parseFloat(process.env.NFSE_ALIQUOTA_ISS ?? "0.02"),
    ambiente:     db?.ambiente       || process.env.NFSE_AMBIENTE           || "homologacao",
    wsUrl:        db?.wsUrl          || process.env.NFSE_WEBSERVICE_URL     || "https://ws-sjrp.giss.com.br/service-ws/nf/nfse-ws",
    wsHomologUrl: db?.wsHomologUrl   || process.env.NFSE_WEBSERVICE_HOMOLOG || "https://ws-ficticio.giss.com.br/service-ws/nf/nfse-ws",
    certPath:     process.env.NFSE_CERT_PATH     || "",
    certPassword: process.env.NFSE_CERT_PASSWORD || "",
  };
}

export async function isNfseConfigured(): Promise<boolean> {
  const c = await getNfseConfig();
  return !!(c.cnpj && c.im && c.certPath);
}

// ─── Certificate loading ──────────────────────────────────────────────────────

interface CertData { privateKey: string; cert: string; pfxBuffer: Buffer }
let _certCache: CertData | null = null;

function loadCert(certPath: string, certPassword: string): CertData {
  if (_certCache) return _certCache;

  const fullPath = path.isAbsolute(certPath) ? certPath : path.join(process.cwd(), certPath);
  if (!fs.existsSync(fullPath)) throw new Error(`Certificado A1 não encontrado: ${fullPath}`);

  const pfxBuffer = fs.readFileSync(fullPath);
  const pfxAsn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  // node-forge only supports SHA-1 MAC; modern PFX files use SHA-256 MAC.
  // Passing false as "strict" skips MAC verification while still decrypting with the password.
  const pfx = (forge.pkcs12 as any).pkcs12FromAsn1(pfxAsn1, false, certPassword);

  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
  if (!keyBags?.length || !keyBags[0].key) throw new Error("Chave privada não encontrada no PFX");
  const privateKey = forge.pki.privateKeyToPem(keyBags[0].key);

  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  if (!certBags?.length || !certBags[0].cert) throw new Error("Certificado não encontrado no PFX");
  const cert = forge.pki.certificateToPem(certBags[0].cert);

  _certCache = { privateKey, cert, pfxBuffer };
  return _certCache;
}

export function getCertStatus(): { found: boolean; path: string } {
  const certPath = process.env.NFSE_CERT_PATH || "";
  if (!certPath) return { found: false, path: "" };
  const fullPath = path.isAbsolute(certPath) ? certPath : path.join(process.cwd(), certPath);
  return { found: fs.existsSync(fullPath), path: certPath };
}

// ─── XML building ─────────────────────────────────────────────────────────────

export interface RpsParams {
  rpsNumber: number;
  emissionDate: Date;
  competenceDate: Date;
  amount: number;
  discriminacao: string;
  tomadorName: string;
  tomadorCpf?: string;
  tomadorCnpj?: string;
  tomadorEmail?: string;
  tomadorPhone?: string;
}

function esc(s: string) { return escapeXml(s); }

function fmtDate(d: Date) { return d.toISOString().split("T")[0]; }

function buildXml(p: RpsParams, c: NfseConfigData): string {
  const ibge = "3549805";
  const rpsId = `rps${p.rpsNumber}`;

  const tomDoc = p.tomadorCpf
    ? `<CpfCnpj><Cpf>${p.tomadorCpf.replace(/\D/g, "")}</Cpf></CpfCnpj>`
    : p.tomadorCnpj
    ? `<CpfCnpj><Cnpj>${p.tomadorCnpj.replace(/\D/g, "")}</Cnpj></CpfCnpj>`
    : "";

  const contato = [
    p.tomadorPhone ? `<Telefone>${p.tomadorPhone.replace(/\D/g, "")}</Telefone>` : "",
    p.tomadorEmail ? `<Email>${esc(p.tomadorEmail)}</Email>` : "",
  ].filter(Boolean).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Rps>
    <InfDeclaracaoPrestacaoServico Id="${rpsId}">
      <Rps>
        <IdentificacaoRps>
          <Numero>${p.rpsNumber}</Numero>
          <Serie>RPS</Serie>
          <Tipo>1</Tipo>
        </IdentificacaoRps>
        <DataEmissao>${fmtDate(p.emissionDate)}</DataEmissao>
        <NaturezaOperacao>1</NaturezaOperacao>
        <OptanteSimplesNacional>1</OptanteSimplesNacional>
        <IncentivadorCultural>2</IncentivadorCultural>
        <Status>1</Status>
      </Rps>
      <Competencia>${fmtDate(p.competenceDate)}</Competencia>
      <Servico>
        <Valores>
          <ValorServicos>${p.amount.toFixed(2)}</ValorServicos>
          <ValorDeducoes>0.00</ValorDeducoes>
          <ValorPis>0.00</ValorPis>
          <ValorCofins>0.00</ValorCofins>
          <ValorInss>0.00</ValorInss>
          <ValorIr>0.00</ValorIr>
          <ValorCsll>0.00</ValorCsll>
          <IssRetido>2</IssRetido>
          <ValorIss>0.00</ValorIss>
          <ValorIssRetido>0.00</ValorIssRetido>
          <OutrasRetencoes>0.00</OutrasRetencoes>
          <BaseCalculo>${p.amount.toFixed(2)}</BaseCalculo>
          <Aliquota>${c.aliquotaIss.toFixed(4)}</Aliquota>
          <ValorLiquidoNfse>${p.amount.toFixed(2)}</ValorLiquidoNfse>
          <DescontoIncondicionado>0.00</DescontoIncondicionado>
          <DescontoCondicionado>0.00</DescontoCondicionado>
        </Valores>
        <ItemListaServico>${c.itemServico}</ItemListaServico>
        <CodigoTributacaoMunicipio>${c.codTributacao}</CodigoTributacaoMunicipio>
        <Discriminacao>${esc(p.discriminacao)}</Discriminacao>
        <CodigoMunicipio>${ibge}</CodigoMunicipio>
        <ExigibilidadeISS>1</ExigibilidadeISS>
        <MunicipioIncidencia>${ibge}</MunicipioIncidencia>
      </Servico>
      <Prestador>
        <CpfCnpj><Cnpj>${c.cnpj}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${c.im}</InscricaoMunicipal>
      </Prestador>
      <Tomador>
        <IdentificacaoTomador>${tomDoc ? `<CpfCnpj>${tomDoc.replace(/<CpfCnpj>|<\/CpfCnpj>/g, "")}</CpfCnpj>` : ""}</IdentificacaoTomador>
        <RazaoSocial>${esc(p.tomadorName)}</RazaoSocial>
        <Endereco><CodigoMunicipio>${ibge}</CodigoMunicipio></Endereco>
        ${contato ? `<Contato>${contato}</Contato>` : ""}
      </Tomador>
    </InfDeclaracaoPrestacaoServico>
  </Rps>
</GerarNfseEnvio>`;
}

// ─── XML signing ──────────────────────────────────────────────────────────────

function signXml(xml: string, privateKey: string, cert: string, rpsId: string): string {
  const sig = new SignedXml({
    privateKey,
    publicCert: cert,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });

  sig.addReference({
    xpath: `//*[@Id="${rpsId}"]`,
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
  });

  sig.computeSignature(xml, {
    location: { reference: `//*[@Id="${rpsId}"]`, action: "after" },
  });

  return sig.getSignedXml();
}

// ─── SOAP ─────────────────────────────────────────────────────────────────────

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapSoap(signedXml: string): string {
  const cabecMsg = escapeXml(
    `<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>`
  );
  const dadosMsg = escapeXml(signedXml);
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://nfse.abrasf.org.br">
  <soapenv:Header/>
  <soapenv:Body>
    <nfse:GerarNfseRequest>
      <nfseCabecMsg>${cabecMsg}</nfseCabecMsg>
      <nfseDadosMsg>${dadosMsg}</nfseDadosMsg>
    </nfse:GerarNfseRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function soapCall(body: string, pfxBuffer: Buffer, password: string, c: NfseConfigData): Promise<string> {
  const isHomolog = c.ambiente !== "producao";
  const wsUrl = isHomolog ? c.wsHomologUrl : c.wsUrl;

  const agent = new https.Agent({
    pfx: pfxBuffer,
    passphrase: password,
    rejectUnauthorized: !isHomolog,
  });

  const res = await axios.post<string>(wsUrl, body, {
    httpsAgent: agent,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://nfse.abrasf.org.br/GerarNfse"',
    },
    timeout: 90_000,
    validateStatus: () => true, // never throw on HTTP errors — capture body instead
  });

  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}: ${String(res.data).substring(0, 800)}`);
  }

  return res.data;
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// Tag regex that ignores optional namespace prefix (e.g. ns3:Codigo or Codigo)
function tagRe(name: string) {
  return new RegExp(`<(?:\\w+:)?${name}>([^<]+)</(?:\\w+:)?${name}>`);
}

function parseResponse(raw: string): NfseResult {
  // The server returns the payload HTML-encoded inside <outputXML>
  const outputMatch = raw.match(/<outputXML>([\s\S]*?)<\/outputXML>/);
  const xml = outputMatch ? decodeEntities(outputMatch[1]) : raw;

  if (xml.includes("MensagemRetorno") || xml.includes("ListaMensagemRetorno")) {
    const cod = xml.match(tagRe("Codigo"))?.[1];
    const msg = xml.match(tagRe("Mensagem"))?.[1];
    const cor = xml.match(tagRe("Correcao"))?.[1];
    const detail = [cod ? `[${cod}]` : null, msg, cor ? `Correção: ${cor}` : null].filter(Boolean).join(" — ");
    return { success: false, error: detail || `Erro sem detalhe: ${xml.substring(0, 300)}` };
  }

  const nfseNumber = xml.match(tagRe("Numero"))?.[1];
  if (!nfseNumber) {
    return { success: false, error: `Resposta inesperada: ${xml.substring(0, 300)}` };
  }

  return {
    success: true,
    nfseNumber,
    verifyCode: xml.match(tagRe("CodigoVerificacao"))?.[1],
    link: xml.match(tagRe("LinkNfse"))?.[1] ?? "https://sjrp.giss.com.br/contribuinte/notas.seam",
    xml,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface NfseResult {
  success: boolean;
  nfseNumber?: string;
  verifyCode?: string;
  link?: string;
  xml?: string;
  error?: string;
}

export async function emitirNfse(p: RpsParams): Promise<NfseResult> {
  const c = await getNfseConfig();
  if (!c.cnpj) return { success: false, error: "CNPJ do prestador não configurado" };
  if (!c.im)   return { success: false, error: "Inscrição Municipal não configurada" };

  try {
    const { privateKey, cert, pfxBuffer } = loadCert(c.certPath, c.certPassword);
    const rpsId = `rps${p.rpsNumber}`;
    const xml    = buildXml(p, c);
    const signed = signXml(xml, privateKey, cert, rpsId);
    const soap   = wrapSoap(signed);
    const raw    = await soapCall(soap, pfxBuffer, c.certPassword, c);
    return parseResponse(raw);
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Erro interno na emissão" };
  }
}
