import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import {
  pairingCookieHeader,
  pairingTokenFromUrl,
} from "../../lib/pairing-cookie.server";
import { preparePairingWithBackend } from "../../lib/remote-session-storage.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const pairingToken = pairingTokenFromUrl(url);
  const pairingCookie = pairingCookieHeader(pairingToken);
  const shop = String(url.searchParams.get("shop") || "").trim().toLowerCase();

  if (shop) {
    if (pairingToken) {
      await preparePairingWithBackend({
        baseUrl: process.env.NEXFORIA_BACKEND_URL,
        secret: process.env.NEXFORIA_COMMERCE_SERVICE_SECRET,
        pairingToken,
        shop,
      });
    }
    url.searchParams.delete("pairing_token");
    const headers = pairingCookie ? { "Set-Cookie": pairingCookie } : undefined;
    throw redirect(`/app?${url.searchParams.toString()}`, { headers });
  }

  return new Response(JSON.stringify({
    showForm: Boolean(login),
    hasPairing: Boolean(pairingToken),
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(pairingCookie ? { "Set-Cookie": pairingCookie } : {}),
    },
  });
};

export default function App() {
  const { showForm, hasPairing } = useLoaderData();

  return (
    <div className={styles.index}>
      <header className={styles.brandBar}>
        <a className={styles.brand} href="https://nextforia.com" aria-label="Nextfor IA">
          <span className={styles.brandMark}>NX</span>
          <span><strong>Nextfor IA</strong><small>Conexión segura</small></span>
        </a>
        <span className={styles.secure}><i /> Instalación oficial de Shopify</span>
      </header>
      <div className={styles.content}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>CONECTA TU TIENDA</span>
          <h1 className={styles.heading}>Shopify y Nextfor, trabajando juntos.</h1>
          <p className={styles.text}>
            Autoriza tu catálogo para que Nextfor pueda recomendar productos,
            consultar disponibilidad y ayudar con pedidos.
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.stepLabel}>PASO ÚNICO</div>
          <h2>Ingresa tu dominio interno de Shopify</h2>
          <p className={styles.cardText}>
            Debe terminar en <strong>.myshopify.com</strong>. No uses el dominio
            público de tu tienda, como <em>mitienda.com</em>.
          </p>
          <ol className={styles.instructions}>
            <li><span>1</span><p>Entra al administrador de <strong>Shopify</strong>.</p></li>
            <li><span>2</span><p>Abajo en el menú principal, abre <strong>Configuración</strong>.</p></li>
            <li><span>3</span><p>Entra a <strong>Dominios</strong>.</p></li>
            <li><span>4</span><p>Copia la dirección que termina en <strong>.myshopify.com</strong>.</p></li>
          </ol>
          {showForm && (
            <Form className={styles.form} method="post" action="/connect">
              <label className={styles.label}>
                <span>Tu dominio de Shopify</span>
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="mitienda.myshopify.com"
                  pattern="[A-Za-z0-9][A-Za-z0-9-]*\.myshopify\.com"
                  title="Usa el dominio que termina en .myshopify.com"
                  required
                />
                <small>Ejemplo: <b>rav-toys.myshopify.com</b></small>
              </label>
              <button className={styles.button} type="submit">
                Continuar con Shopify →
              </button>
            </Form>
          )}
          <p className={hasPairing ? styles.ready : styles.warning}>
            <i /> {hasPairing
              ? "Nextfor ya preparó la conexión. No necesitas ningún código de emparejamiento."
              : "Abre esta pantalla desde el botón “Conectar Shopify” de Nextfor para vincularla a tu empresa."}
          </p>
        </section>

        <section className={styles.promises}>
          <article><b>✓</b><span><strong>Solo lectura</strong>Nextfor no modifica tu catálogo ni tus pedidos.</span></article>
          <article><b>✓</b><span><strong>Conexión privada</strong>La tienda queda ligada únicamente a tu empresa.</span></article>
          <article><b>✓</b><span><strong>Control total</strong>Puedes desinstalar la app cuando quieras.</span></article>
        </section>
      </div>
    </div>
  );
}
