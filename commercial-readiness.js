const COMMERCIAL_READINESS = {
  version: "2026-07-24",
  stages: [
    {
      id: "sales_qualification",
      label: "Calificacion comercial",
      owner: "NexforIA",
      status: "ready",
      items: [
        "Definir vertical, volumen de chats y canal actual de WhatsApp.",
        "Confirmar plataforma de ecommerce o fuente de catalogo.",
        "Confirmar quien interviene chats humanos y horario de atencion.",
        "Acordar alcance inicial: ventas, garantias, envios, estado de pedidos."
      ]
    },
    {
      id: "client_access",
      label: "Accesos del cliente",
      owner: "Cliente",
      status: "draft",
      items: [
        "Meta Business Manager con permisos de administrador.",
        "WhatsApp Business Account o autorizacion para crear/conectar uno.",
        "Numero telefonico disponible para Cloud API o flujo de coexistencia si aplica.",
        "Acceso a Shopify/Admin API o fuente equivalente de pedidos/catalogo.",
        "Politica de privacidad publica y datos legales del negocio."
      ]
    },
    {
      id: "technical_onboarding",
      label: "Onboarding tecnico",
      owner: "NexforIA",
      status: "draft",
      items: [
        "Crear tenant/configuracion por cliente.",
        "Guardar phone_number_id, WABA ID, dominio Shopify y tokens por cliente.",
        "Configurar webhook y verificar recepcion de mensajes.",
        "Cargar usuarios/roles del dashboard del cliente.",
        "Ejecutar smoke test de catalogo, pedido, handoff y alertas."
      ]
    },
    {
      id: "meta_whatsapp",
      label: "Meta WhatsApp - app aprobada",
      owner: "Meta/Cliente",
      status: "ready",
      items: [
        "App NexforIA aprobada para whatsapp_business_messaging y whatsapp_business_management.",
        "Revision de nombre visible del cliente.",
        "Verificacion del numero por SMS o llamada.",
        "Carga y aprobacion de plantillas iniciales.",
        "Revision de limites de mensajeria/calidad antes de escalar volumen."
      ]
    },
    {
      id: "go_live",
      label: "Salida a produccion",
      owner: "NexforIA + Cliente",
      status: "draft",
      items: [
        "Prueba real con cliente interno del comercio.",
        "Activar alertas operativas y horario de soporte.",
        "Definir playbook de intervencion humana.",
        "Medir 7 dias: chats, ventas iniciadas, handoffs, errores y oportunidades."
      ]
    }
  ],
  defaultRoles: [
    { role: "super_admin", purpose: "Equipo NexforIA; administra tenants, integraciones, salud global y configuracion sensible de plataforma." },
    { role: "admin", purpose: "Duenos o lider operativo; configura usuarios, pruebas y metricas." },
    { role: "agent", purpose: "Asesora; toma control, responde chats y gestiona notas/etiquetas." },
    { role: "viewer", purpose: "Solo lectura; ve metricas y conversaciones sin intervenir." }
  ],
  requiredTenantFields: [
    "tenant_id",
    "brand_name",
    "business_manager_id",
    "waba_id",
    "phone_number_id",
    "display_phone",
    "shopify_store_domain",
    "shopify_admin_token",
    "dashboard_users",
    "notification_phones",
    "privacy_policy_url"
  ]
};

module.exports = COMMERCIAL_READINESS;
