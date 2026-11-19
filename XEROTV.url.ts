interface PagesContext {
  request: Request;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const origin = new URL(context.request.url).origin;
  const body = `[InternetShortcut]\r\nURL=${origin.replace(/\/+$/, "")}\r\n`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/internet-shortcut; charset=utf-8",
      "Content-Disposition": 'attachment; filename="XEROTV.url"',
      "Cache-Control": "no-store",
    },
  });
}
