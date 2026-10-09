/**
 * Vercel Serverless Function Entry Point
 * Hệ thống Quản lý KPI Phòng Kế toán Nhà nước - KBNN Khu vực XV
 * Tác giả: Trần Quốc Hoàng
 */

const { handleKpiRequest, ensureMongoConnected } = require('../server.js');

module.exports = async (req, res) => {
  try {
    await ensureMongoConnected();
    return await handleKpiRequest(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Serverless error: ' + err.message }));
    }
  }
};
