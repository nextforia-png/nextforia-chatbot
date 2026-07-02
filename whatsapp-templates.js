module.exports = [
  {
    name: "order_confirmation_rav",
    category: "UTILITY",
    language: "es_CO",
    useCase: "Confirmar que recibimos la solicitud de pedido.",
    bodyVariables: [
      { key: "customer_name", sample: "Maria" },
      { key: "channel", sample: "WhatsApp" },
      { key: "product", sample: "LOOKY LOOKY Juguete Sensorial" },
      { key: "total", sample: "$79.950 COP" }
    ]
  },
  {
    name: "payment_instructions_rav",
    category: "UTILITY",
    language: "es_CO",
    useCase: "Reenviar instrucciones de pago cuando el cliente ya inicio pedido.",
    bodyVariables: [
      { key: "customer_name", sample: "Laura" },
      { key: "order", sample: "Bloques magneticos" },
      { key: "total", sample: "$129.900 COP" },
      { key: "payment_method", sample: "transferencia" }
    ]
  },
  {
    name: "shipping_update_rav",
    category: "UTILITY",
    language: "es_CO",
    useCase: "Actualizar estado de entrega o despacho.",
    bodyVariables: [
      { key: "customer_name", sample: "Andres" },
      { key: "status", sample: "en preparacion" },
      { key: "reference", sample: "pedido 1048" }
    ]
  },
  {
    name: "warranty_case_received_rav",
    category: "UTILITY",
    language: "es_CO",
    useCase: "Confirmar recepcion de una solicitud de garantia.",
    bodyVariables: [
      { key: "customer_name", sample: "Carolina" },
      { key: "case_summary", sample: "garantia por pieza faltante" },
      { key: "product", sample: "Carro montable" }
    ]
  },
  {
    name: "human_followup_rav",
    category: "MARKETING",
    language: "es_CO",
    useCase: "Retomar un chat donde el cliente pidio asesora o quedo en control humano.",
    bodyVariables: [
      { key: "customer_name", sample: "Daniela" },
      { key: "agent_name", sample: "Eliana" },
      { key: "topic", sample: "el pedido del juguete sensorial" }
    ],
    requiresOptOut: true
  },
  {
    name: "abandoned_cart_rav",
    category: "MARKETING",
    language: "es_CO",
    useCase: "Recuperar un carrito iniciado y no finalizado.",
    bodyVariables: [
      { key: "customer_name", sample: "Sofia" },
      { key: "product", sample: "LOOKY LOOKY Juguete Sensorial" }
    ],
    requiresOptOut: true
  },
  {
    name: "product_recommendation_rav",
    category: "MARKETING",
    language: "es_CO",
    useCase: "Enviar recomendacion solicitada o segmentada de productos.",
    bodyVariables: [
      { key: "customer_name", sample: "Valentina" },
      { key: "audience", sample: "ninos de 3 a 5 anos" },
      { key: "recommendation", sample: "juguetes sensoriales y bloques magneticos" }
    ],
    requiresOptOut: true
  },
  {
    name: "back_in_stock_rav",
    category: "MARKETING",
    language: "es_CO",
    useCase: "Avisar disponibilidad de un producto por el que el cliente pregunto.",
    bodyVariables: [
      { key: "customer_name", sample: "Natalia" },
      { key: "product", sample: "Carro montable azul" }
    ],
    requiresOptOut: true
  },
  {
    name: "post_sale_review_rav",
    category: "UTILITY",
    language: "es_CO",
    useCase: "Pedir calificacion despues de una compra o atencion finalizada.",
    bodyVariables: [
      { key: "customer_name", sample: "Camila" }
    ]
  }
];
