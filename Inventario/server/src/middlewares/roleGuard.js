export const roleGuard = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Acesso não autorizado. Autenticação obrigatória.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Acesso negado. Esta operação exige perfil [${allowedRoles.join(', ')}]. Seu perfil atual é [${req.user.role}].`,
      });
    }

    next();
  };
};

export const permissionGuard = (permissionKey) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Acesso não autorizado.',
      });
    }

    // Administradores e Sócios possuem todas as permissões
    if (req.user.role === 'ADMIN' || req.user.role === 'SOCIO') {
      return next();
    }

    const userPermissoes = req.user.permissoes || {};
    if (!userPermissoes[permissionKey]) {
      return res.status(403).json({
        success: false,
        message: `Acesso negado. Seu usuário não possui a permissão '${permissionKey}'.`,
      });
    }

    next();
  };
};
