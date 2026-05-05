export type ProductFeatureMatrixSection =
    | {
          kind: 'core';
          productKey: 'RESERVAS' | 'EVENTOS' | 'CLASES' | 'TIENDA';
          title: string;
          rows: Array<{
              feature: string;
              base: boolean;
              pro: boolean;
          }>;
      }
    | {
          kind: 'addons';
          title: string;
          rows: Array<{
              addOnKey:
                  | 'PERSONALIZACION_PRO'
                  | 'METRICAS'
                  | 'MENSAJERIA_PRO'
                  | 'CRM_PRO';
              name: string;
              features: string[];
              dependency?: string | null;
              status: string;
          }>;
      };

export const PRODUCT_FEATURE_MATRIX: ProductFeatureMatrixSection[] = [
    {
        kind: 'core',
        productKey: 'RESERVAS',
        title: 'Reservas',
        rows: [
            { feature: 'Reservas 1:1', base: true, pro: true },
            { feature: 'Servicios y categorías', base: true, pro: true },
            { feature: 'Personal / recursos', base: true, pro: true },
            { feature: 'Disponibilidad', base: true, pro: true },
            { feature: 'Confirmaciones básicas', base: true, pro: true },
            { feature: 'Multi-staff checkout / reservas agrupadas', base: true, pro: true },
            { feature: 'Servicio con múltiples sesiones', base: false, pro: true },
            { feature: 'Selección de fecha/hora por sesión', base: false, pro: true },
        ],
    },
    {
        kind: 'core',
        productKey: 'EVENTOS',
        title: 'Eventos',
        rows: [
            { feature: 'Eventos pagados', base: true, pro: true },
            { feature: 'Eventos gratuitos', base: true, pro: true },
            { feature: 'Formularios de registro', base: true, pro: true },
            { feature: 'Lista de interesados', base: true, pro: true },
            { feature: 'Control de asistencia avanzado', base: false, pro: true },
            { feature: 'Tickets / códigos si existen', base: false, pro: true },
        ],
    },
    {
        kind: 'core',
        productKey: 'CLASES',
        title: 'Clases',
        rows: [
            { feature: 'Clases recurrentes', base: true, pro: true },
            { feature: 'Sesiones', base: true, pro: true },
            { feature: 'Inscripciones', base: true, pro: true },
            { feature: 'Asistencia básica', base: true, pro: true },
            { feature: 'Asistencia avanzada', base: false, pro: true },
            { feature: 'Cuotas / installments si existen', base: false, pro: true },
        ],
    },
    {
        kind: 'core',
        productKey: 'TIENDA',
        title: 'Tienda',
        rows: [
            { feature: 'Productos y categorías', base: true, pro: true },
            { feature: 'Pickup y delivery', base: true, pro: true },
            { feature: 'Pedidos manuales / QR', base: true, pro: true },
            { feature: 'Costo de delivery manual', base: true, pro: true },
            { feature: 'Promociones de productos', base: false, pro: true },
            { feature: 'Combos estructurados', base: false, pro: true },
            { feature: 'Asignación de pedidos a staff', base: false, pro: true },
            { feature: 'Métricas de tienda', base: false, pro: true },
        ],
    },
    {
        kind: 'addons',
        title: 'Add-ons',
        rows: [
            {
                addOnKey: 'PERSONALIZACION_PRO',
                name: 'Personalización Pro',
                features: [
                    'CTA avanzado',
                    'Layouts',
                    'Footer',
                    'Anuncios',
                    'Orden de secciones',
                    'Branding visual',
                ],
                status: 'Activo',
            },
            {
                addOnKey: 'METRICAS',
                name: 'Métricas',
                features: [
                    'Dashboards',
                    'Ingresos',
                    'Clientes',
                    'Reseñas',
                    'Top servicios',
                    'Top personal',
                ],
                status: 'Activo',
            },
            {
                addOnKey: 'MENSAJERIA_PRO',
                name: 'Mensajería Pro',
                features: [
                    'Recordatorios',
                    'Campañas',
                    'Solicitudes de reseña',
                    'Comunicación masiva',
                ],
                status: 'Activo',
            },
            {
                addOnKey: 'CRM_PRO',
                name: 'CRM Pro',
                features: [
                    'Segmentación',
                    'Importación / exportación',
                    'Reactivación',
                    'Historial avanzado',
                ],
                status: 'Activo',
            },
        ],
    },
];
