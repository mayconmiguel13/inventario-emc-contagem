export const errorHandler = (err, req, res, next) => {
  console.error(' [Backend Error]', err);

  // Erros do Prisma
  if (err.code === 'P2002') {
    const target = err.meta?.target ? ` (${err.meta.target})` : '';
    return res.status(409).json({
      success: false,
      message: `Conflito de dados: Já existe um registro com este valor único${target}.`,
      error: 'UNIQUE_CONSTRAINT_VIOLATION',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Registro não encontrado no banco de dados.',
      error: 'NOT_FOUND',
    });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Erro interno no servidor de gestão jurídica.',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
