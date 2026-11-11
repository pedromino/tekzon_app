/**
 * ==========================================================================
 * SERVICIO DE EXTRACCIÓN Y AGREGACIÓN DE REPORTES (reportesDataService.js)
 * TEKZON C.A. - SISTEMA DE GESTIÓN TÉCNICA E INVENTARIO
 * ==========================================================================
 * CAPA: Lógica de Datos Analíticos · Criterio Gerencial y Operacional
 *
 * PROPÓSITO:
 *   Procesa consultas analíticas especializadas con KPIs, agregaciones,
 *   rentabilidad, márgenes porcentuales y métricas de desempeño para
 *   los 9 módulos del sistema (cero consultas planas "SELECT *").
 * ==========================================================================
 */
import pool from '../../config/db.js';

export const ReportesDataService = {
  /**
   * 1. REPORTE DE CATÁLOGO DE PRODUCTOS (Margen, Rentabilidad e Inventario Valorizado)
   */
  async obtenerReporteProductos(filtros = {}) {
    const condiciones = ['p.estado = 1'];
    const params = [];

    if (filtros.id_categoria) {
      condiciones.push('p.id_categoria = ?');
      params.push(Number(filtros.id_categoria));
    }

    if (filtros.situacion === 'agotado') {
      condiciones.push('p.existencia <= 0');
    } else if (filtros.situacion === 'bajo') {
      condiciones.push('p.existencia > 0 AND p.existencia <= p.stock_minimo');
    } else if (filtros.situacion === 'disponible') {
      condiciones.push('p.existencia > p.stock_minimo');
    }

    if (filtros.texto) {
      const criterio = `%${filtros.texto}%`;
      condiciones.push('(p.cod_producto LIKE ? OR p.nombre_producto LIKE ? OR p.marca LIKE ?)');
      params.push(criterio, criterio, criterio);
    }

    const where = `WHERE ${condiciones.join(' AND ')}`;

    const sql = `
      SELECT
        p.cod_producto AS codigo,
        p.nombre_producto AS nombre,
        c.nombre_categoria AS categoria,
        p.marca,
        p.precio_costo AS costo,
        p.precio_venta AS precio,
        (p.precio_venta - p.precio_costo) AS margen_bruto,
        CASE
          WHEN p.precio_costo > 0 THEN ROUND(((p.precio_venta - p.precio_costo) / p.precio_costo) * 100, 1)
          ELSE 100.0
        END AS margen_porcentaje,
        p.existencia,
        p.stock_minimo,
        (p.existencia * p.precio_costo) AS valor_costo,
        (p.existencia * p.precio_venta) AS valor_venta,
        CASE
          WHEN p.existencia <= 0 THEN 'Agotado'
          WHEN p.existencia <= p.stock_minimo THEN 'Bajo mínimo'
          ELSE 'Disponible'
        END AS situacion
      FROM producto p
      LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
      ${where}
      ORDER BY p.nombre_producto ASC
    `;

    const [filas] = await pool.query(sql, params);

    // Indicadores clave (KPIs)
    let totalItems = filas.length;
    let unidadesTotales = 0;
    let valorTotalCosto = 0;
    let valorTotalVenta = 0;
    let itemsAgotados = 0;
    let itemsBajoMinimo = 0;

    filas.forEach((r) => {
      unidadesTotales += Number(r.existencia || 0);
      valorTotalCosto += Number(r.valor_costo || 0);
      valorTotalVenta += Number(r.valor_venta || 0);
      if (r.situacion === 'Agotado') itemsAgotados++;
      if (r.situacion === 'Bajo mínimo') itemsBajoMinimo++;
    });

    const gananciaPotencial = valorTotalVenta - valorTotalCosto;
    const margenGeneralPct = valorTotalCosto > 0
      ? ((gananciaPotencial / valorTotalCosto) * 100).toFixed(1)
      : '0.0';

    return {
      titulo: 'Reporte Gerencial de Inventario y Rentabilidad',
      tipo: 'GERENCIAL',
      modulo: 'Catálogo de Productos',
      descripcion: 'Análisis de capital inmovilizado en existencias, márgenes de ganancia bruta y estado de reposición de artículos.',
      kpis: [
        { etiqueta: 'Artículos Catalogados', valor: totalItems, tipo: 'entero' },
        { etiqueta: 'Existencias Totales', valor: unidadesTotales, tipo: 'entero' },
        { etiqueta: 'Inversión en Almacén (Costo)', valor: valorTotalCosto, tipo: 'moneda' },
        { etiqueta: 'Valor de Venta Proyectado', valor: valorTotalVenta, tipo: 'moneda' },
        { etiqueta: 'Margen Promedio Ponderado', valor: `${margenGeneralPct}%`, tipo: 'texto' },
        { etiqueta: 'Artículos en Alerta / Agotados', valor: itemsAgotados + itemsBajoMinimo, tipo: 'alerta' }
      ],
      columnas: [
        { clave: 'codigo', etiqueta: 'Código', ancho: 14, tipo: 'texto' },
        { clave: 'nombre', etiqueta: 'Producto', ancho: 26, tipo: 'texto' },
        { clave: 'categoria', etiqueta: 'Categoría', ancho: 16, tipo: 'texto' },
        { clave: 'costo', etiqueta: 'Costo (USD)', ancho: 13, tipo: 'moneda' },
        { clave: 'precio', etiqueta: 'Precio (USD)', ancho: 13, tipo: 'moneda' },
        { clave: 'margen_bruto', etiqueta: 'Margen ($)', ancho: 13, tipo: 'moneda' },
        { clave: 'margen_porcentaje', etiqueta: 'Margen (%)', ancho: 13, tipo: 'porcentaje' },
        { clave: 'existencia', etiqueta: 'Stock', ancho: 10, tipo: 'entero' },
        { clave: 'valor_costo', etiqueta: 'Valor Costo', ancho: 14, tipo: 'moneda' },
        { clave: 'situacion', etiqueta: 'Situación', ancho: 14, tipo: 'texto' }
      ],
      filas
    };
  },

  /**
   * 2. REPORTE DE CATEGORÍAS (Participación y Capital por Clasificación)
   */
  async obtenerReporteCategorias(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.estado === 'activas') condiciones.push('c.estado = 1');
    if (filtros.estado === 'inactivas') condiciones.push('c.estado = 0');

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.id_categoria AS id,
        c.nombre_categoria AS categoria,
        CASE WHEN c.estado = 1 THEN 'Activa' ELSE 'Inactiva' END AS estado,
        COUNT(p.cod_producto) AS productos_activos,
        COALESCE(SUM(p.existencia), 0) AS unidades_existencia,
        COALESCE(SUM(p.existencia * p.precio_costo), 0) AS inversion_costo,
        COALESCE(SUM(p.existencia * p.precio_venta), 0) AS valor_venta_estimado,
        COALESCE(AVG(CASE WHEN p.precio_costo > 0 THEN ((p.precio_venta - p.precio_costo) / p.precio_costo) * 100 ELSE 0 END), 0) AS margen_promedio
      FROM categoria c
      LEFT JOIN producto p ON p.id_categoria = c.id_categoria AND p.estado = 1
      ${where}
      GROUP BY c.id_categoria, c.nombre_categoria, c.estado
      ORDER BY inversion_costo DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalCategorias = filas.length;
    let sumaInversion = filas.reduce((acc, r) => acc + Number(r.inversion_costo || 0), 0);
    let totalUnidades = filas.reduce((acc, r) => acc + Number(r.unidades_existencia || 0), 0);

    // Calcular participación porcentual
    filas.forEach((r) => {
      r.inversion_costo = Number(r.inversion_costo);
      r.valor_venta_estimado = Number(r.valor_venta_estimado);
      r.margen_promedio = Number(Number(r.margen_promedio).toFixed(1));
      r.participacion_porcentaje = sumaInversion > 0
        ? Number(((r.inversion_costo / sumaInversion) * 100).toFixed(1))
        : 0;
    });

    return {
      titulo: 'Reporte de Distribución y Capital por Categoría',
      tipo: 'SUPERVISION',
      modulo: 'Categorías',
      descripcion: 'Evaluación del capital financiero distribuido por línea de producto y concentración de inventario.',
      kpis: [
        { etiqueta: 'Total Categorías', valor: totalCategorias, tipo: 'entero' },
        { etiqueta: 'Total Unidades Físicas', valor: totalUnidades, tipo: 'entero' },
        { etiqueta: 'Capital Total Invertido', valor: sumaInversion, tipo: 'moneda' },
        { etiqueta: 'Categoría Líder en Stock', valor: filas[0]?.categoria || 'N/A', tipo: 'texto' }
      ],
      columnas: [
        { clave: 'categoria', etiqueta: 'Categoría', ancho: 26, tipo: 'texto' },
        { clave: 'estado', etiqueta: 'Estado', ancho: 12, tipo: 'texto' },
        { clave: 'productos_activos', etiqueta: 'Variedades', ancho: 14, tipo: 'entero' },
        { clave: 'unidades_existencia', etiqueta: 'Unidades Stock', ancho: 16, tipo: 'entero' },
        { clave: 'inversion_costo', etiqueta: 'Capital Invertido', ancho: 18, tipo: 'moneda' },
        { clave: 'valor_venta_estimado', etiqueta: 'Retorno Estimado', ancho: 18, tipo: 'moneda' },
        { clave: 'margen_promedio', etiqueta: 'Margen Prom. (%)', ancho: 18, tipo: 'porcentaje' },
        { clave: 'participacion_porcentaje', etiqueta: 'Participación (%)', ancho: 18, tipo: 'porcentaje' }
      ],
      filas
    };
  },

  /**
   * 3. REPORTE DE ENTRADAS Y SALIDAS (Kárdex y Auditoría de Movimientos)
   */
  async obtenerReporteMovimientos(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.tipo) {
      condiciones.push('m.tipo_movimiento = ?');
      params.push(String(filtros.tipo).toUpperCase());
    }

    if (filtros.fecha_desde) {
      condiciones.push('DATE(m.fecha_movimiento) >= ?');
      params.push(filtros.fecha_desde);
    }

    if (filtros.fecha_hasta) {
      condiciones.push('DATE(m.fecha_movimiento) <= ?');
      params.push(filtros.fecha_hasta);
    }

    if (filtros.cod_producto) {
      condiciones.push('m.cod_producto = ?');
      params.push(filtros.cod_producto);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        m.id_movimiento AS id,
        DATE_FORMAT(m.fecha_movimiento, '%d/%m/%Y %H:%i') AS fecha_formateada,
        m.tipo_movimiento AS tipo,
        m.cod_producto AS codigo,
        p.nombre_producto AS producto,
        m.existencia_previa AS antes,
        m.cantidad,
        m.existencia_posterior AS despues,
        m.motivo,
        u.nombre_usuario AS responsable,
        (m.cantidad * p.precio_costo) AS valor_estimado
      FROM movimiento_inventario m
      INNER JOIN producto p ON p.cod_producto = m.cod_producto
      INNER JOIN usuario u ON u.id_usuario = m.id_usuario
      ${where}
      ORDER BY m.fecha_movimiento DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalMovimientos = filas.length;
    let totalEntradas = 0;
    let totalSalidas = 0;
    let totalAjustes = 0;
    let unidadesEntradas = 0;
    let unidadesSalidas = 0;

    filas.forEach((r) => {
      if (r.tipo === 'ENTRADA') {
        totalEntradas++;
        unidadesEntradas += Number(r.cantidad);
      } else if (r.tipo === 'SALIDA') {
        totalSalidas++;
        unidadesSalidas += Number(r.cantidad);
      } else if (r.tipo === 'AJUSTE') {
        totalAjustes++;
      }
    });

    return {
      titulo: 'Reporte Operacional de Kárdex y Auditoría de Movimientos',
      tipo: 'OPERACIONAL',
      modulo: 'Entradas y Salidas de Almacén',
      descripcion: 'Auditoría cronológica de ingresos de mercancía, salidas operativas y ajustes justificados de inventario.',
      kpis: [
        { etiqueta: 'Total Movimientos', valor: totalMovimientos, tipo: 'entero' },
        { etiqueta: 'Entradas Físicas', valor: `${totalEntradas} (${unidadesEntradas} u.)`, tipo: 'texto' },
        { etiqueta: 'Salidas Físicas', valor: `${totalSalidas} (${unidadesSalidas} u.)`, tipo: 'texto' },
        { etiqueta: 'Ajustes Auditados', valor: totalAjustes, tipo: 'entero' }
      ],
      columnas: [
        { clave: 'id', etiqueta: 'ID', ancho: 8, tipo: 'entero' },
        { clave: 'fecha_formateada', etiqueta: 'Fecha / Hora', ancho: 18, tipo: 'texto' },
        { clave: 'tipo', etiqueta: 'Tipo', ancho: 12, tipo: 'texto' },
        { clave: 'codigo', etiqueta: 'Código', ancho: 14, tipo: 'texto' },
        { clave: 'producto', etiqueta: 'Artículo', ancho: 24, tipo: 'texto' },
        { clave: 'antes', etiqueta: 'Previa', ancho: 10, tipo: 'entero' },
        { clave: 'cantidad', etiqueta: 'Cant.', ancho: 10, tipo: 'entero' },
        { clave: 'despues', etiqueta: 'Posterior', ancho: 10, tipo: 'entero' },
        { clave: 'motivo', etiqueta: 'Motivo / Justificación', ancho: 26, tipo: 'texto' },
        { clave: 'responsable', etiqueta: 'Responsable', ancho: 16, tipo: 'texto' }
      ],
      filas
    };
  },

  /**
   * 4. REPORTE DE PROVEEDORES (Desempeño y Volumen de Compras)
   */
  async obtenerReporteProveedores(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.estado === 'activos') condiciones.push('p.estado = 1');
    if (filtros.estado === 'inactivos') condiciones.push('p.estado = 0');

    if (filtros.texto) {
      const criterio = `%${filtros.texto}%`;
      condiciones.push('(p.rif_proveedor LIKE ? OR p.nombre_proveedor LIKE ?)');
      params.push(criterio, criterio);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        p.rif_proveedor AS rif,
        p.nombre_proveedor AS nombre,
        COALESCE(p.telefono_proveedor, '—') AS telefono,
        COALESCE(p.direccion_proveedor, '—') AS direccion,
        CASE WHEN p.estado = 1 THEN 'Activo' ELSE 'Inactivo' END AS status,
        COUNT(c.id_compra) AS total_facturas,
        COALESCE(SUM(c.monto_total), 0) AS volumen_total_usd,
        COALESCE(DATE_FORMAT(MAX(c.fecha_compra), '%d/%m/%Y'), 'Sin compras') AS ultima_compra
      FROM proveedor p
      LEFT JOIN compra c ON c.rif_proveedor = p.rif_proveedor
      ${where}
      GROUP BY p.rif_proveedor, p.nombre_proveedor, p.telefono_proveedor, p.direccion_proveedor, p.estado
      ORDER BY volumen_total_usd DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalProveedores = filas.length;
    let volumenGlobal = filas.reduce((acc, r) => acc + Number(r.volumen_total_usd || 0), 0);
    let totalFacturas = filas.reduce((acc, r) => acc + Number(r.total_facturas || 0), 0);

    return {
      titulo: 'Reporte Gerencial de Proveedores y Compras Acumuladas',
      tipo: 'GERENCIAL',
      modulo: 'Proveedores y Compras',
      descripcion: 'Volumen comercial de adquisición a proveedores, facturas emitidas y concentración de suministro.',
      kpis: [
        { etiqueta: 'Proveedores Evaluados', valor: totalProveedores, tipo: 'entero' },
        { etiqueta: 'Facturas de Compra', valor: totalFacturas, tipo: 'entero' },
        { etiqueta: 'Volumen Total Comprado', valor: volumenGlobal, tipo: 'moneda' },
        { etiqueta: 'Proveedor Principal', valor: filas[0]?.nombre || 'N/A', tipo: 'texto' }
      ],
      columnas: [
        { clave: 'rif', etiqueta: 'RIF', ancho: 16, tipo: 'texto' },
        { clave: 'nombre', etiqueta: 'Nombre / Razón Social', ancho: 28, tipo: 'texto' },
        { clave: 'telefono', etiqueta: 'Teléfono', ancho: 16, tipo: 'texto' },
        { clave: 'direccion', etiqueta: 'Dirección Comercial', ancho: 26, tipo: 'texto' },
        { clave: 'status', etiqueta: 'Status', ancho: 12, tipo: 'texto' },
        { clave: 'total_facturas', etiqueta: 'Facturas', ancho: 12, tipo: 'entero' },
        { clave: 'volumen_total_usd', etiqueta: 'Volumen Total (USD)', ancho: 18, tipo: 'moneda' },
        { clave: 'ultima_compra', etiqueta: 'Última Compra', ancho: 16, tipo: 'texto' }
      ],
      filas
    };
  },

  /**
   * 5. REPORTE DEL PANEL TÉCNICO (Órdenes, Eficiencia y Facturación de Taller)
   */
  async obtenerReporteOrdenes(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.estado) {
      condiciones.push('UPPER(o.estado) = ?');
      params.push(filtros.estado.toUpperCase());
    }

    if (filtros.id_usuario) {
      condiciones.push('o.id_usuario = ?');
      params.push(Number(filtros.id_usuario));
    }

    if (filtros.fecha_desde) {
      condiciones.push('DATE(o.fecha_ingreso) >= ?');
      params.push(filtros.fecha_desde);
    }

    if (filtros.fecha_hasta) {
      condiciones.push('DATE(o.fecha_ingreso) <= ?');
      params.push(filtros.fecha_hasta);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        o.id_ordentec AS id,
        DATE_FORMAT(o.fecha_ingreso, '%d/%m/%Y %H:%i') AS fecha_ingreso,
        COALESCE(DATE_FORMAT(o.fecha_entrega, '%d/%m/%Y'), 'En taller') AS fecha_entrega,
        o.estado,
        c.cedula_cli AS cedula,
        CONCAT(c.nombre_cliente, ' ', c.apellido_cliente) AS cliente,
        CONCAT(d.nombre_dis, ' (', d.marca, ' ', d.modelo, ')') AS equipo,
        COALESCE(u.nombre_usuario, 'Sin asignar') AS tecnico,
        o.costo_mano_obra AS mano_obra,
        COALESCE((SELECT SUM(dr.subtotal) FROM detalle_orden dr WHERE dr.id_ordentec = o.id_ordentec), 0) AS repuestos,
        (o.costo_mano_obra + COALESCE((SELECT SUM(dr.subtotal) FROM detalle_orden dr WHERE dr.id_ordentec = o.id_ordentec), 0)) AS total
      FROM orden_tecnico o
      INNER JOIN dispositivo d ON d.id_dispositivo = o.id_dispositivo
      INNER JOIN cliente c ON c.cedula_cli = d.cedula_cli
      LEFT JOIN usuario u ON u.id_usuario = o.id_usuario
      ${where}
      ORDER BY o.fecha_ingreso DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalOrdenes = filas.length;
    let totalEntregadas = 0;
    let totalTaller = 0;
    let recaudacionManoObra = 0;
    let consumoRepuestos = 0;
    let recaudacionTotal = 0;

    filas.forEach((r) => {
      r.mano_obra = Number(r.mano_obra || 0);
      r.repuestos = Number(r.repuestos || 0);
      r.total = Number(r.total || 0);

      recaudacionManoObra += r.mano_obra;
      consumoRepuestos += r.repuestos;
      recaudacionTotal += r.total;

      const est = String(r.estado || '').toUpperCase();
      if (est === 'ENTREGADO') totalEntregadas++;
      else if (est !== 'CANCELADO') totalTaller++;
    });

    const tasaResolucion = totalOrdenes > 0
      ? ((totalEntregadas / totalOrdenes) * 100).toFixed(1)
      : '0.0';

    return {
      titulo: 'Reporte Gerencial y de Supervisión del Taller Técnico',
      tipo: 'GERENCIAL',
      modulo: 'Servicio Técnico',
      descripcion: 'Productividad del personal técnico, facturación de servicios y consumo de repuestos en reparaciones.',
      kpis: [
        { etiqueta: 'Total Órdenes Atendidas', valor: totalOrdenes, tipo: 'entero' },
        { etiqueta: 'Órdenes Entregadas', valor: totalEntregadas, tipo: 'entero' },
        { etiqueta: 'Equipos en Taller', valor: totalTaller, tipo: 'entero' },
        { etiqueta: 'Tasa de Resolución', valor: `${tasaResolucion}%`, tipo: 'texto' },
        { etiqueta: 'Facturado en Mano de Obra', valor: recaudacionManoObra, tipo: 'moneda' },
        { etiqueta: 'Facturación Global Taller', valor: recaudacionTotal, tipo: 'moneda' }
      ],
      columnas: [
        { clave: 'id', etiqueta: 'OT #', ancho: 10, tipo: 'entero' },
        { clave: 'fecha_ingreso', etiqueta: 'Fecha Ingreso', ancho: 18, tipo: 'texto' },
        { clave: 'estado', etiqueta: 'Estado', ancho: 16, tipo: 'texto' },
        { clave: 'cliente', etiqueta: 'Cliente', ancho: 24, tipo: 'texto' },
        { clave: 'equipo', etiqueta: 'Dispositivo', ancho: 24, tipo: 'texto' },
        { clave: 'tecnico', etiqueta: 'Técnico', ancho: 16, tipo: 'texto' },
        { clave: 'mano_obra', etiqueta: 'Mano Obra ($)', ancho: 14, tipo: 'moneda' },
        { clave: 'repuestos', etiqueta: 'Repuestos ($)', ancho: 14, tipo: 'moneda' },
        { clave: 'total', etiqueta: 'Total (USD)', ancho: 14, tipo: 'moneda' }
      ],
      filas
    };
  },

  /**
   * 6. REPORTE DE DISPOSITIVOS (Incidencias y Equipos Frecuentes)
   */
  async obtenerReporteDispositivos(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.marca) {
      condiciones.push('d.marca = ?');
      params.push(filtros.marca);
    }

    if (filtros.texto) {
      const criterio = `%${filtros.texto}%`;
      condiciones.push('(d.numero_serie LIKE ? OR d.marca LIKE ? OR d.modelo LIKE ? OR d.nombre_dis LIKE ?)');
      params.push(criterio, criterio, criterio, criterio);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        d.numero_serie AS serial,
        d.nombre_dis AS tipo,
        d.marca,
        d.modelo,
        CONCAT(c.nombre_cliente, ' ', c.apellido_cliente) AS propietario,
        COALESCE(c.telefono_cliente, '—') AS telefono,
        COUNT(o.id_ordentec) AS total_reparaciones,
        COALESCE(DATE_FORMAT(MAX(o.fecha_ingreso), '%d/%m/%Y'), 'Sin órdenes') AS ultima_visita
      FROM dispositivo d
      INNER JOIN cliente c ON c.cedula_cli = d.cedula_cli
      LEFT JOIN orden_tecnico o ON o.id_dispositivo = d.id_dispositivo
      ${where}
      GROUP BY d.id_dispositivo, d.numero_serie, d.nombre_dis, d.marca, d.modelo, c.nombre_cliente, c.apellido_cliente, c.telefono_cliente
      ORDER BY total_reparaciones DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalDispositivos = filas.length;
    let reparacionesTotales = filas.reduce((acc, r) => acc + Number(r.total_reparaciones || 0), 0);
    let equiposConReingreso = filas.filter((r) => Number(r.total_reparaciones) > 1).length;

    return {
      titulo: 'Reporte Operacional de Dispositivos y Frecuencia de Reparación',
      tipo: 'OPERACIONAL',
      modulo: 'Dispositivos y Equipos',
      descripcion: 'Inventario de equipos atendidos en taller, recurrencia de reparaciones e identificación de propietarios.',
      kpis: [
        { etiqueta: 'Dispositivos Registrados', valor: totalDispositivos, tipo: 'entero' },
        { etiqueta: 'Reparaciones Realizadas', valor: reparacionesTotales, tipo: 'entero' },
        { etiqueta: 'Equipos con Múltiples Visitas', valor: equiposConReingreso, tipo: 'entero' },
        { etiqueta: 'Promedio Reparaciones/Equipo', valor: (reparacionesTotales / (totalDispositivos || 1)).toFixed(1), tipo: 'texto' }
      ],
      columnas: [
        { clave: 'serial', etiqueta: 'Serial / IMEI', ancho: 18, tipo: 'texto' },
        { clave: 'tipo', etiqueta: 'Tipo', ancho: 14, tipo: 'texto' },
        { clave: 'marca', etiqueta: 'Marca', ancho: 14, tipo: 'texto' },
        { clave: 'modelo', etiqueta: 'Modelo', ancho: 20, tipo: 'texto' },
        { clave: 'propietario', etiqueta: 'Propietario', ancho: 24, tipo: 'texto' },
        { clave: 'telefono', etiqueta: 'Teléfono', ancho: 16, tipo: 'texto' },
        { clave: 'total_reparaciones', etiqueta: 'Visitas a Taller', ancho: 16, tipo: 'entero' },
        { clave: 'ultima_visita', etiqueta: 'Último Ingreso', ancho: 16, tipo: 'texto' }
      ],
      filas
    };
  },

  /**
   * 7. REPORTE DE CAJA (Arqueo, Cierres y Flujo Financiero)
   */
  async obtenerReporteCaja(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.fecha_desde) {
      condiciones.push('DATE(c.fecha_apertura) >= ?');
      params.push(filtros.fecha_desde);
    }

    if (filtros.fecha_hasta) {
      condiciones.push('DATE(c.fecha_apertura) <= ?');
      params.push(filtros.fecha_hasta);
    }

    if (filtros.estado === 'abiertas') {
      condiciones.push("c.estado = 'ABIERTA'");
    } else if (filtros.estado === 'cerradas') {
      condiciones.push("c.estado = 'CERRADA'");
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.id_caja AS id,
        DATE_FORMAT(c.fecha_apertura, '%d/%m/%Y %H:%i') AS apertura,
        c.estado AS estado_turno,
        u.nombre_usuario AS cajero,
        c.monto_apertura AS inicial,
        c.monto_cierre AS final,
        COALESCE((SELECT SUM(p.monto_usd) FROM pago p WHERE p.id_caja = c.id_caja), 0) AS total_recaudado,
        COALESCE((SELECT SUM(p.monto_usd) FROM pago p WHERE p.id_caja = c.id_caja AND p.metodo_pago IN ('EFECTIVO', 'DIVISAS', 'EFECTIVO_USD')), 0) AS efectivo_usd,
        COALESCE((SELECT SUM(p.monto_usd) FROM pago p WHERE p.id_caja = c.id_caja AND p.metodo_pago NOT IN ('EFECTIVO', 'DIVISAS', 'EFECTIVO_USD')), 0) AS pagos_digitales
      FROM caja c
      INNER JOIN usuario u ON u.id_usuario = c.id_usuario
      ${where}
      ORDER BY c.fecha_apertura DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalCajas = filas.length;
    let totalRecaudadoGlobal = 0;
    let efectivoGlobal = 0;
    let digitalesGlobal = 0;

    filas.forEach((r) => {
      r.inicial = Number(r.inicial || 0);
      r.final = Number(r.final || 0);
      r.total_recaudado = Number(r.total_recaudado || 0);
      r.efectivo_usd = Number(r.efectivo_usd || 0);
      r.pagos_digitales = Number(r.pagos_digitales || 0);

      totalRecaudadoGlobal += r.total_recaudado;
      efectivoGlobal += r.efectivo_usd;
      digitalesGlobal += r.pagos_digitales;
    });

    return {
      titulo: 'Reporte Gerencial de Arqueo y Control de Turnos de Caja',
      tipo: 'GERENCIAL',
      modulo: 'Caja y Contabilidad Diaria',
      descripcion: 'Auditoría de aperturas, cierres de turno, recaudación acumulada y cuadre por método de pago.',
      kpis: [
        { etiqueta: 'Turnos Auditados', valor: totalCajas, tipo: 'entero' },
        { etiqueta: 'Recaudación Consolidada', valor: totalRecaudadoGlobal, tipo: 'moneda' },
        { etiqueta: 'Cobrado en Efectivo / Divisas', valor: efectivoGlobal, tipo: 'moneda' },
        { etiqueta: 'Cobrado en Medios Digitales (Bs)', valor: digitalesGlobal, tipo: 'moneda' }
      ],
      columnas: [
        { clave: 'id', etiqueta: 'Caja #', ancho: 10, tipo: 'entero' },
        { clave: 'apertura', etiqueta: 'Fecha Apertura', ancho: 18, tipo: 'texto' },
        { clave: 'estado_turno', etiqueta: 'Estado', ancho: 12, tipo: 'texto' },
        { clave: 'cajero', etiqueta: 'Cajero', ancho: 16, tipo: 'texto' },
        { clave: 'inicial', etiqueta: 'Base Inicial', ancho: 14, tipo: 'moneda' },
        { clave: 'total_recaudado', etiqueta: 'Cobrado Total', ancho: 16, tipo: 'moneda' },
        { clave: 'efectivo_usd', etiqueta: 'Efectivo USD', ancho: 14, tipo: 'moneda' },
        { clave: 'pagos_digitales', etiqueta: 'Digitales (Bs)', ancho: 14, tipo: 'moneda' }
      ],
      filas
    };
  },

  /**
   * 8. REPORTE DE VENTAS (Ticket Promedio, Recaudación y Mostrador)
   */
  async obtenerReporteVentas(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.fecha_desde) {
      condiciones.push('DATE(v.fecha_venta) >= ?');
      params.push(filtros.fecha_desde);
    }

    if (filtros.fecha_hasta) {
      condiciones.push('DATE(v.fecha_venta) <= ?');
      params.push(filtros.fecha_hasta);
    }

    if (filtros.metodo_pago) {
      condiciones.push('p.metodo_pago = ?');
      params.push(filtros.metodo_pago);
    }

    if (filtros.cedula_cli) {
      condiciones.push('v.cedula_cli = ?');
      params.push(filtros.cedula_cli);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        v.num_factura AS factura,
        DATE_FORMAT(v.fecha_venta, '%d/%m/%Y %H:%i') AS fecha,
        v.cedula_cli AS cedula,
        CONCAT(c.nombre_cliente, ' ', c.apellido_cliente) AS cliente,
        v.monto_total AS total,
        COALESCE(p.metodo_pago, 'EFECTIVO_USD') AS metodo,
        COALESCE(p.tasa_cambio, 1.00) AS tasa_bcv,
        COALESCE(p.referencia, '—') AS referencia,
        COALESCE(u.nombre_usuario, 'Mostrador') AS vendedor,
        COALESCE((SELECT COUNT(*) FROM detalle_factura df WHERE df.num_factura = v.num_factura), 0) AS articulos
      FROM venta v
      INNER JOIN cliente c ON c.cedula_cli = v.cedula_cli
      LEFT JOIN pago p ON p.venta_num_factura = v.num_factura
      LEFT JOIN usuario u ON u.id_usuario = v.id_usuario
      ${where}
      ORDER BY v.fecha_venta DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalVentas = filas.length;
    let facturacionTotal = 0;
    let articulosTotales = 0;

    filas.forEach((r) => {
      r.total = Number(r.total || 0);
      r.articulos = Number(r.articulos || 0);
      facturacionTotal += r.total;
      articulosTotales += r.articulos;
    });

    const ticketPromedio = totalVentas > 0
      ? (facturacionTotal / totalVentas).toFixed(2)
      : 0;

    return {
      titulo: 'Reporte Gerencial de Ventas Directas y Comportamiento Comercial',
      tipo: 'GERENCIAL',
      modulo: 'Ventas y Facturación',
      descripcion: 'Facturación consolidada en mostrador, ticket promedio por cliente, rotación de artículos y medios de pago.',
      kpis: [
        { etiqueta: 'Facturas Emitidas', valor: totalVentas, tipo: 'entero' },
        { etiqueta: 'Facturación Total', valor: facturacionTotal, tipo: 'moneda' },
        { etiqueta: 'Ticket Promedio de Venta', valor: Number(ticketPromedio), tipo: 'moneda' },
        { etiqueta: 'Artículos Despachados', valor: articulosTotales, tipo: 'entero' }
      ],
      columnas: [
        { clave: 'factura', etiqueta: 'N° Factura', ancho: 14, tipo: 'texto' },
        { clave: 'fecha', etiqueta: 'Fecha / Hora', ancho: 18, tipo: 'texto' },
        { clave: 'cliente', etiqueta: 'Cliente', ancho: 24, tipo: 'texto' },
        { clave: 'articulos', etiqueta: 'Ítems', ancho: 10, tipo: 'entero' },
        { clave: 'metodo', etiqueta: 'Método Pago', ancho: 16, tipo: 'texto' },
        { clave: 'referencia', etiqueta: 'Referencia', ancho: 16, tipo: 'texto' },
        { clave: 'total', etiqueta: 'Total (USD)', ancho: 14, tipo: 'moneda' },
        { clave: 'vendedor', etiqueta: 'Vendedor', ancho: 16, tipo: 'texto' }
      ],
      filas
    };
  },

  /**
   * 9. REPORTE DE CLIENTES (Valor Acumulado y Fidelización)
   */
  async obtenerReporteClientes(filtros = {}) {
    const condiciones = [];
    const params = [];

    if (filtros.texto) {
      const criterio = `%${filtros.texto}%`;
      condiciones.push('(c.cedula_cli LIKE ? OR c.nombre_cliente LIKE ? OR c.apellido_cliente LIKE ?)');
      params.push(criterio, criterio, criterio);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.cedula_cli AS cedula,
        CONCAT(c.nombre_cliente, ' ', c.apellido_cliente) AS nombre,
        COALESCE(c.telefono_cliente, '—') AS telefono,
        COALESCE(c.direccion_cli, '—') AS direccion,
        (SELECT COUNT(*) FROM dispositivo d WHERE d.cedula_cli = c.cedula_cli) AS equipos,
        (SELECT COUNT(*) FROM orden_tecnico ot INNER JOIN dispositivo d ON d.id_dispositivo = ot.id_dispositivo WHERE d.cedula_cli = c.cedula_cli) AS ordenes,
        (SELECT COUNT(*) FROM venta v WHERE v.cedula_cli = c.cedula_cli) AS compras,
        (
          COALESCE((SELECT SUM(v.monto_total) FROM venta v WHERE v.cedula_cli = c.cedula_cli), 0) +
          COALESCE((SELECT SUM(o.costo_mano_obra) FROM orden_tecnico o INNER JOIN dispositivo d ON d.id_dispositivo = o.id_dispositivo WHERE d.cedula_cli = c.cedula_cli AND UPPER(o.estado) = 'ENTREGADO'), 0)
        ) AS valor_acumulado
      FROM cliente c
      ${where}
      ORDER BY valor_acumulado DESC
    `;

    const [filas] = await pool.query(sql, params);

    let totalClientes = filas.length;
    let valorGlobalCartera = 0;
    let clientesFrecuentes = 0;

    filas.forEach((r) => {
      r.valor_acumulado = Number(r.valor_acumulado || 0);
      r.equipos = Number(r.equipos || 0);
      r.ordenes = Number(r.ordenes || 0);
      r.compras = Number(r.compras || 0);

      valorGlobalCartera += r.valor_acumulado;
      if (r.ordenes + r.compras > 1) clientesFrecuentes++;
    });

    return {
      titulo: 'Reporte Gerencial de Cartera de Clientes y Fidelización',
      tipo: 'GERENCIAL',
      modulo: 'Clientes',
      descripcion: 'Valor acumulado aportado por cada cliente a la empresa, volumen de reparaciones y frecuencia de compra.',
      kpis: [
        { etiqueta: 'Cartera Total de Clientes', valor: totalClientes, tipo: 'entero' },
        { etiqueta: 'Valor Aportado a la Empresa', valor: valorGlobalCartera, tipo: 'moneda' },
        { etiqueta: 'Clientes Recurrentes', valor: clientesFrecuentes, tipo: 'entero' },
        { etiqueta: 'Cliente de Mayor Valor', valor: filas[0]?.nombre || 'N/A', tipo: 'texto' }
      ],
      columnas: [
        { clave: 'cedula', etiqueta: 'Cédula', ancho: 14, tipo: 'texto' },
        { clave: 'nombre', etiqueta: 'Nombre y Apellido', ancho: 26, tipo: 'texto' },
        { clave: 'telefono', etiqueta: 'Teléfono', ancho: 16, tipo: 'texto' },
        { clave: 'equipos', etiqueta: 'Equipos', ancho: 10, tipo: 'entero' },
        { clave: 'ordenes', etiqueta: 'Órdenes', ancho: 10, tipo: 'entero' },
        { clave: 'compras', etiqueta: 'Compras', ancho: 10, tipo: 'entero' },
        { clave: 'valor_acumulado', etiqueta: 'Total Aportado (USD)', ancho: 18, tipo: 'moneda' }
      ],
      filas
    };
  },

  /**
   * Router despachador por tipo de módulo.
   */
  async obtenerDatosReporte(tipo, filtros = {}) {
    switch (tipo.toLowerCase()) {
      case 'productos':
        return await this.obtenerReporteProductos(filtros);
      case 'categorias':
        return await this.obtenerReporteCategorias(filtros);
      case 'movimientos':
        return await this.obtenerReporteMovimientos(filtros);
      case 'proveedores':
        return await this.obtenerReporteProveedores(filtros);
      case 'ordenes':
        return await this.obtenerReporteOrdenes(filtros);
      case 'dispositivos':
        return await this.obtenerReporteDispositivos(filtros);
      case 'caja':
        return await this.obtenerReporteCaja(filtros);
      case 'ventas':
        return await this.obtenerReporteVentas(filtros);
      case 'clientes':
        return await this.obtenerReporteClientes(filtros);
      default:
        throw new Error(`Tipo de reporte no soportado: ${tipo}`);
    }
  }
};

export default ReportesDataService;
