import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the auth session on every request, and keep unauthenticated
 * visitors out of the app.
 *
 * Session refresh has to happen here rather than in a layout: Server
 * Components cannot set cookies, so a token that expires mid-session would
 * never be renewed and the user would be signed out for no reason.
 */
const PUBLIC = ["/login", "/landing", "/auth", "/api/v1", "/api/inbound", "/api/seed", "/api/diag"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  let res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // With auth unconfigured the app behaves as it did before: single tenant,
  // open. That keeps a local checkout runnable without Supabase Auth set up,
  // and is why SETUP.md is explicit that a real deployment must configure it.
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!user && !isPublic) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    // so a deep link survives the round trip through sign-in
    if (pathname !== "/") to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }

  if (user && pathname === "/login") {
    const to = req.nextUrl.clone();
    to.pathname = "/board";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
