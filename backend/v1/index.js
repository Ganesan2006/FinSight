const express = require("express");

const router = express.Router();
router.use(require("../routes/health.routes"));
router.use(require("../routes/auth.routes"));
router.use(require("../routes/finance.routes"));
router.use(require("../routes/sms.routes"));
router.use(require("../routes/sources.routes"));

module.exports = router;
