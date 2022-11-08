import { parse as cookieParse } from "cookie";
import { parse as queryStringParse } from "query-string";

addEventListener("fetch", (event) => {
  event.respondWith(
    handleRequest(event.request).catch(
      (err) => new Response(err.stack, { status: 500 })
    )
  );
});

const getAccess = async () => {
  const response = await fetch(ACCESS_URL);
  const json = await response.json();
  return json;
};

const create404 = () => new Response("404 Not Found", { status: 404 });
const createError = (error) => new Response(error.stack, { status: 500 });

const createResponse = (response) =>
  new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });

const createRedirect = (url) =>
  new Response(
    `<script>location.href=${JSON.stringify(url)} + location.hash;</script>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }
  );

const processRule = async (access, request, response, rule) => {
  const url = new URL(request.url);

  let handled = true;
  const handlers = [];

  if (handled && rule.host) {
    if (url.host !== rule.host) {
      handled = false;
    }
  }

  if (handled && rule.remoteAddress) {
    let allowed = rule.remoteAddress;
    if (!Array.isArray(allowed)) {
      allowed = [allowed];
    }
    if (!allowed.includes(request.headers.get("CF-Connecting-IP"))) {
      handled = false;
    }
  }

  if (handled && rule.cookies) {
    for (const cookie in rule.cookies) {
      if (request.cookies[cookie] !== rule.cookies[cookie]) {
        handled = false;
      }
    }
  }

  if (handled && rule.query) {
    const query = queryStringParse(url.search || "");
    for (const key in rule.query) {
      if (query[key] !== rule.query[key]) {
        handled = false;
      }
    }
  }

  if (handled && rule.referrer) {
    const referrer = request.headers.get("Referer");
    if (referrer !== rule.referrer) {
      handled = false;
    }
  }

  if (handled && rule.path) {
    if (typeof rule.path === "string") {
      if (!url.pathname.startsWith(rule.path)) {
        handled = false;
      }
    } else if (rule.path.re) {
      if (!new RegExp(rule.path.re).test(url.pathname)) {
        handled = false;
      }
    }
  }

  if (!handled) {
    return { response, handlers, done: false };
  }

  if (rule.cacheControl) {
    handlers.push((response) => {
      response.headers.set("Cache-Control", rule.cacheControl);
      return response;
    });
  }

  if (rule["set-cookie"]) {
    for (const cookie in rule["set-cookie"]) {
      request.cookies[cookie] = rule["set-cookie"][cookie];
    }
  }

  if (rule.redirect) {
    if (rule.redirect === ":pathname") {
      return { response: createRedirect(url.pathname), handlers, done: true };
    } else {
      const redirect = rule.redirect
        .replace(/\$\{path\}/, url.pathname + url.search)
        .replace(/\$\{pathname\}/, url.pathname)
        .replace(/\$\{query\}/, url.query);
      return { response: createRedirect(redirect), handlers, done: true };
    }
  }

  if (rule.allow) {
    return { response, handlers, done: true };
  }

  if (rule.serve) {
    const response = createResponse(
      await fetch(`${rule.serve}${url.pathname}`)
    );
    return { response, handlers, done: true };
  }

  return { response, handlers, done: false };
};

const responseHandler = (access, request, response) => {
  const expires = new Date(Date.now() + 10 * 366 * 24 * 3600 * 1000);

  for (const cookie in request.cookies) {
    response.headers.append(
      "Set-Cookie",
      `${cookie}=${
        request.cookies[cookie]
      }; Expires=${expires.toUTCString()}; Domain=${
        access.host
      }; Secure; Path=/`
    );
  }

  response.headers.set(
    "Cache-Control",
    access.cacheControl ||
      `public, max-age=${7 * 24 * 3600}, stale-while-revalidate=${
        31 * 24 * 3600
      }`
  );
  response.headers.set(
    "Strict-Transport-Security",
    `max-age=${366 * 10 * 24 * 3600}`
  );
  return response;
};

const handleRequest = async (request) => {
  const url = new URL(request.url);
  let response;
  let handlers = [];

  if (url.protocol === "http:") {
    url.protocol = "https:";
    return Response.redirect(url, 301);
  }

  try {
    const access = await getAccess();

    request.cookies = cookieParse(request.headers.get("Cookie") || "");

    handlers.push(responseHandler.bind(null, access, request));

    if (
      !(access.blacklist || []).reduce(
        (a, b) => a || url.pathname.startsWith(b),
        false
      )
    ) {
      let allowed = false;

      if (access.host && url.host === access.host) {
        allowed = true;
      }

      if (access.hosts && access.hosts.includes(url.host)) {
        allowed = true;
      }

      if (allowed) {
        for (const rule of access.rules) {
          const {
            response: r,
            handlers: h = [],
            done,
          } = await processRule(access, request, response, rule);
          response = r;
          handlers.push(...h);

          if (done) {
            if (!response) {
              response = createResponse(await fetch(`${SITE}${url.pathname}`));
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    return createError(err);
  }

  if (!response) {
    response = create404();
  }

  for (const handler of handlers) {
    response = await handler(response);
  }
  return response;
};
