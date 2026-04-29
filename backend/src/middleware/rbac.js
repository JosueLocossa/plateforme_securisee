const checkRole = (rolesAutorises) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    if (!rolesAutorises.includes(req.user.role)) {
      return res.status(403).json({
        error: `Accès refusé — rôle '${req.user.role}' non autorisé ici`
      });
    }
    next();
  };
};

module.exports = { checkRole };
