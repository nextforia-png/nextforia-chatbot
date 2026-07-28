import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    const pairingToken = String(url.searchParams.get("pairing_token") || "").trim();
    url.searchParams.delete("pairing_token");
    const headers = pairingToken
      ? {
          "Set-Cookie": [
            "nexforia_pairing=",
            encodeURIComponent(pairingToken),
            "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900"
          ].join("")
        }
      : undefined;
    throw redirect(`/app?${url.searchParams.toString()}`, { headers });
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Conecta Shopify con NextforIA</h1>
        <p className={styles.text}>
          Autoriza el catálogo de tu tienda para que tu agente pueda recomendar
          productos, consultar disponibilidad y ayudar con pedidos.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Dominio de tu tienda</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Conectar tienda
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li><strong>Solo lectura.</strong> NextforIA no modifica tu catálogo ni tus pedidos.</li>
          <li><strong>Una sola conexión.</strong> La tienda queda ligada únicamente a tu empresa.</li>
          <li><strong>Control total.</strong> Puedes desinstalar la app cuando quieras.</li>
        </ul>
      </div>
    </div>
  );
}
