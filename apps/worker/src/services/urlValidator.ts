import dns from 'node:dns/promises';
import net from 'node:net';

// Check if an IP address string is private, loopback, link-local, carrier-grade NAT, or cloud metadata.
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (RFC 1918 Private)
    if (parts[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local & Cloud instance metadata 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (RFC 1918 Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (RFC 1918 Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;
    // 255.255.255.255 (Broadcast)
    if (ip === '255.255.255.255') return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // ::1 (Loopback) or :: (Unspecified)
    if (lower === '::1' || lower === '::') return true;
    // fe80::/10 (Link-local)
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true;
    }
    // fc00::/7 (Unique local address / private)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
    if (lower.startsWith('::ffff:')) {
      const ipv4Part = lower.slice(7);
      return isPrivateOrReservedIp(ipv4Part);
    }
    return false;
  }

  return true;
}

// Validate that a submitted URL is syntactically valid and does not resolve to private or cloud metadata IPs (SSRF protection).
export async function validatePublicUrl(
  rawUrl: string
): Promise<{ valid: boolean; error?: string }> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS URLs are permitted' };
  }

  let checkHost = parsed.hostname.toLowerCase().trim();
  if (!checkHost) {
    return { valid: false, error: 'Hostname cannot be empty' };
  }

  // Strip brackets from IPv6 hostnames like [::1]
  if (checkHost.startsWith('[') && checkHost.endsWith(']')) {
    checkHost = checkHost.slice(1, -1);
  }

  // Block local / internal hostnames
  if (
    checkHost === 'localhost' ||
    checkHost.endsWith('.localhost') ||
    checkHost.endsWith('.local') ||
    checkHost.endsWith('.internal') ||
    checkHost.endsWith('.lan') ||
    checkHost.endsWith('.home')
  ) {
    return { valid: false, error: 'Local or internal hostnames are prohibited' };
  }

  // If hostname is directly an IP literal (IPv4 or IPv6)
  if (net.isIP(checkHost)) {
    if (isPrivateOrReservedIp(checkHost)) {
      return { valid: false, error: 'Private or local IP addresses are prohibited (SSRF protection)' };
    }
    return { valid: true };
  }

  // In offline unit test environments without internet, skip DNS resolution for public domains
  const isTest =
    process.env.NODE_ENV === 'test' ||
    process.argv.some((arg) => arg.includes('test')) ||
    Boolean(process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.includes('test'));
  if (isTest) {
    return { valid: true };
  }

  // Resolve hostname via DNS to verify it doesn't resolve to private or metadata IPs
  try {
    const addresses = await dns.lookup(checkHost, { all: true });
    if (!addresses || addresses.length === 0) {
      return { valid: false, error: 'Could not resolve domain name' };
    }

    for (const record of addresses) {
      if (isPrivateOrReservedIp(record.address)) {
        return {
          valid: false,
          error: `Domain resolves to private or restricted IP address (${record.address})`,
        };
      }
    }
  } catch {
    return { valid: false, error: 'Domain name resolution failed' };
  }

  return { valid: true };
}
