# Cloudflare ACL Worker Proxy

Create a file `access.json` in the root directory of your public html folder where your site is served.

```json
{
  "host": "example.com",
  "blacklist": ["/access.json"],
  "rules": [
    ...
  ]
}
```

Where rules are executed in order on each request.

Make sure `blacklist` at least contains your access.json file, otherwise it will be exposed to the public through any `allow: true` rules.

## Environment Variables

```
WORKER=worker-name-on-cloudflare
CLOUDFLARE_AUTH_KEY=auth-key-on-cloudflare
CLOUDFLARE_AUTH_EMAIL=auth-email-on-cloudflare
CLOUDFLARE_ACCOUNT_ID=account-id-on-cloudflare
CLOUDFLARE_ZONE_ID=zone-id-on-cloudflare
SITE=url-and-path-to-default-site
```

`access.json` is to be found at the root of the site given in `SITE`

## Deployment

```
yarn sls deploy
```

## Rule Matching

### Source IP Address

```json
{
  "remoteAddress": ["ip_address"],
  ...
}
```

### Query Parameters

```json
{
  "query": {
    "name": "value",
    ...
  },
  ...
}
```

### Cookies

```json
{
  "cookies": {
    "name": "value",
    ...
  },
  ...
}
```

### Path Prefixes

```json
{
  "path": "/path/to/files",
  ...
}
```

## Rule Targets

### Redirect

To redirect to the pathname and hash of the matched document:

```json
{
  "redirect": ":pathname"
}
```

To redirect to a relative or absolute url:

```json
{
  "redirect": "http://example.com"
}
```

### Proxy

To proxy a HTTP site:

```json
{
  "serve": "https://example.com/path/to/files"
}
```

### Default site

To pass through to the default site where the access.json is found:

```json
{
  "allow": true
}
```
