export default function handler(_req, res) {
  res.status(200).json({
    success: true,
    data: {
      status: 'OK',
      runtime: 'vercel-function',
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
}
