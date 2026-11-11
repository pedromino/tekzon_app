/**
 * ==========================================================================
 * CONTROLADOR DE VENTA DIRECTA (ventaController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo 3 (Mostrador)
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST de la venta rápida de mostrador, consumidos por
 *   `VentaServices.js` del frontend Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   · Todas las rutas exigen sesión de Administrador.
 *   · El usuario de la sesión se pasa al servicio para firmar la FK
 *     `venta.id_usuario` y los asientos del kádex con el usuario REAL.
 *   · Las rutas literales (`/indicadores`, `/mas-vendidos`, `/metodos-pago`) se
 *     declaran ANTES de `/:numFactura` para que Express no las interprete como
 *     un número de factura.
 *
 *   | Método | Ruta                                      | Acción                    |
 *   |--------|-------------------------------------------|---------------------------|
 *   | GET    | /api/ventas                               | Histórico de facturas     |
 *   | GET    | /api/ventas/indicadores                   | KPI del mostrador         |
 *   | GET    | /api/ventas/mas-vendidos                  | Informe de más vendidos   |
 *   | GET    | /api/ventas/metodos-pago                  | Selector de formas de pago|
 *   | GET    | /api/ventas/:numFactura                   | Factura completa          |
 *   | POST   | /api/ventas                               | Registrar venta directa   |
 *   | POST   | /api/ventas/:numFactura/anular            | Anular y devolver stock   |
 * ==========================================================================
 */
import { VentaService } from '../services/ventaService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const VentaController = {
  /**
   * GET /api/ventas?texto=&cedula=&fechaDesde=&fechaHasta=
   * Histórico de facturas del mostrador.
   */
  async getVentas(req, res) {
    try {
      const ventas = await VentaService.obtenerVentas(req.query);

      return res.status(200).json({
        exito: true,
        total: ventas.length,
        ventas
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ventas');
    }
  },

  /** GET /api/ventas/indicadores -> KPI del mostrador. */
  async getIndicadores(req, res) {
    try {
      const indicadores = await VentaService.obtenerIndicadores();

      return res.status(200).json({ exito: true, indicadores });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ventas/indicadores');
    }
  },

  /** GET /api/ventas/mas-vendidos?limite=10 -> informe de rotación. */
  async getMasVendidos(req, res) {
    try {
      const productos = await VentaService.obtenerProductosMasVendidos(req.query.limite);

      return res.status(200).json({ exito: true, productos });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ventas/mas-vendidos');
    }
  },

  /** GET /api/ventas/metodos-pago -> catálogo de formas de pago admitidas. */
  async getMetodosPago(req, res) {
    try {
      return res.status(200).json({
        exito: true,
        metodos_pago: VentaService.obtenerMetodosPago()
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ventas/metodos-pago');
    }
  },

  /**
   * GET /api/ventas/:numFactura
   * Factura completa: cabecera, líneas de producto y pago registrado.
   */
  async getVentaPorFactura(req, res) {
    try {
      const ventaCompleta = await VentaService.obtenerVentaPorFactura(req.params.numFactura);

      return res.status(200).json({ exito: true, ...ventaCompleta });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ventas/:numFactura');
    }
  },

  /**
   * POST /api/ventas
   * REGISTRA LA VENTA DIRECTA COMPLETA:
   *   cliente + productos + descuento de inventario + kádex (origen "Venta")
   *   + alertas de stock + pago + factura.
   */
  async postVenta(req, res) {
    try {
      const resultado = await VentaService.registrarVenta(req.body, req.usuarioAutenticado);

      return res.status(201).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/ventas');
    }
  },

  /**
   * POST /api/ventas/:numFactura/anular
   * Anula la factura (baja lógica) y devuelve los productos al inventario.
   */
  async postAnularVenta(req, res) {
    try {
      const resultado = await VentaService.anularVenta(
        req.params.numFactura,
        req.body,
        req.usuarioAutenticado
      );

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/ventas/:numFactura/anular');
    }
  }
};

export default VentaController;
