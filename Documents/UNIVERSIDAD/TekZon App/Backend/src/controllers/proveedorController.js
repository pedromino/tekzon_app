/**
 * ==========================================================================
 * CONTROLADOR DE PROVEEDORES (proveedorController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo de Proveedores
 * ==========================================================================
 */
import { ProveedorService } from '../services/proveedorService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const ProveedorController = {
  /**
   * GET /api/proveedores
   */
  async getProveedores(req, res) {
    try {
      const soloActivos = req.query.soloActivos === 'true' || req.query.activos === 'true';
      const texto = req.query.texto || req.query.q || '';

      const proveedores = await ProveedorService.listarProveedores({ texto, soloActivos });

      return res.status(200).json({
        exito: true,
        total: proveedores.length,
        proveedores
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/proveedores');
    }
  },

  /**
   * GET /api/proveedores/:rif
   */
  async getProveedorPorRif(req, res) {
    try {
      const proveedor = await ProveedorService.obtenerProveedor(req.params.rif);
      return res.status(200).json({ exito: true, proveedor });
    } catch (error) {
      return responderConError(res, error, 'GET /api/proveedores/:rif');
    }
  },

  /**
   * POST /api/proveedores
   */
  async postProveedor(req, res) {
    try {
      const proveedor = await ProveedorService.crearProveedor(req.body);

      return res.status(201).json({
        exito: true,
        mensaje: `Proveedor "${proveedor.nombre_proveedor}" registrado exitosamente.`,
        proveedor
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/proveedores');
    }
  },

  /**
   * PUT /api/proveedores/:rif
   */
  async putProveedor(req, res) {
    try {
      const proveedor = await ProveedorService.actualizarProveedor(req.params.rif, req.body);

      return res.status(200).json({
        exito: true,
        mensaje: `Proveedor "${proveedor.nombre_proveedor}" actualizado correctamente.`,
        proveedor
      });
    } catch (error) {
      return responderConError(res, error, 'PUT /api/proveedores/:rif');
    }
  },

  /**
   * PATCH /api/proveedores/:rif/estado
   */
  async patchEstado(req, res) {
    try {
      const { estado } = req.body;
      const proveedor = await ProveedorService.cambiarEstado(req.params.rif, estado);
      const accion = Number(proveedor.estado) === 1 ? 'habilitado' : 'deshabilitado';

      return res.status(200).json({
        exito: true,
        mensaje: `Proveedor "${proveedor.nombre_proveedor}" ${accion} exitosamente.`,
        proveedor
      });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/proveedores/:rif/estado');
    }
  }
};

export default ProveedorController;
