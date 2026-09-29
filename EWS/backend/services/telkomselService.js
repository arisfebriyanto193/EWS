/**
 * Telkomsel Service for EWS IoT Platform
 * Handles Telkomsel CIAM Authentication, AES-128-OFB encryption,
 * and TDW API Gateway Quota & Balance Monitoring.
 */

const crypto = require('crypto');

class TelkomselService {
  constructor() {
    this.CIAM_HOST = 'https://ciam.telkomsel.com';
    this.CIAM_CLIENT_ID = 'e7126474617aa39eb9e484233c9b0649';
    this.CIAM_CLIENT_SECRET = 'P@ssw0rd';
    this.CIAM_REDIRECT_URI = 'https://my.telkomsel.com/web/callback';
    this.CIAM_SCOPE = 'profile openid phone identifier';

    this.API_HOST = 'https://tdw.telkomsel.com/api/';
    this.API_KEY = '95a0c6d9-d209-481c-a313-4495654654e2';
    this.API_HASH_KEY = 'Q6G7GuuUJ8bqnUEa8vW66CUMSTEPTr7k';
    this.APP_VERSION = '2.0.0';
    this.USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    // Store in-memory pending OTP requests by ews_id
    this.pendingOtpMap = new Map();
  }

  evpBytesToKey(password, keyLen = 16, ivLen = 16) {
    let d = Buffer.alloc(0);
    let di = Buffer.alloc(0);
    const passBuf = Buffer.isBuffer(password) ? password : Buffer.from(password, 'utf8');
    while (d.length < keyLen + ivLen) {
      di = crypto.createHash('md5').update(Buffer.concat([di, passBuf])).digest();
      d = Buffer.concat([d, di]);
    }
    return {
      key: d.subarray(0, keyLen),
      iv: d.subarray(keyLen, keyLen + ivLen),
    };
  }

  encryptAes128Ofb(plaintext, password = 'production') {
    const { key, iv } = this.evpBytesToKey(password, 16, 16);
    const cipher = crypto.createCipheriv('aes-128-ofb', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return encrypted.toString('base64');
  }

  formatMsisdn(phone) {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    } else if (digits.startsWith('8')) {
      digits = '62' + digits;
    }
    return digits;
  }

  generateTransactionId(msisdn) {
    const last5 = msisdn && msisdn.length >= 5 ? msisdn.slice(-5) : (msisdn || '').padStart(5, '0');
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const nowStr = yy + mm + dd + hh + mi + ss + ms;
    return `A302${nowStr}${last5}0`;
  }

  generateHash(transactionId, urlPath) {
    const cleanUrl = urlPath.split('?')[0];
    const stringToHash = `${transactionId}${this.API_HASH_KEY}${cleanUrl}${this.APP_VERSION}`;
    return crypto.createHash('sha224').update(stringToHash, 'utf8').digest('hex');
  }

  async requestOtp(phoneNumber) {
    const msisdn = this.formatMsisdn(phoneNumber);
    if (!msisdn || msisdn.length < 10) {
      throw new Error('Nomor HP Telkomsel tidak valid (minimal 10 digit).');
    }

    const fullPhone = '+' + msisdn;
    const url = `${this.CIAM_HOST}/iam/v1/realms/tsel/authenticate?authIndexType=service&authIndexValue=phoneLogin`;
    const headers = {
      'AM-CLIENTID': this.CIAM_CLIENT_ID,
      'AM-PHONENUMBER': fullPhone,
      'AM-SEND': 'otp',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Origin': 'https://my.telkomsel.com',
      'Referer': 'https://my.telkomsel.com/',
      'User-Agent': this.USER_AGENT,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gagal meminta OTP (HTTP ${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    if (!data.authId) {
      throw new Error('Respons CIAM tidak menyertakan authId: ' + JSON.stringify(data));
    }

    return {
      authId: data.authId,
      callbacks: data.callbacks,
      msisdn,
      formattedPhone: fullPhone,
    };
  }

  async submitOtp(authData, otp) {
    if (!authData || !authData.authId) {
      throw new Error('Data sesi OTP tidak valid atau telah kedaluwarsa.');
    }
    const cleanOtp = String(otp || '').trim();
    if (!cleanOtp) {
      throw new Error('Kode OTP tidak boleh kosong.');
    }

    let callbacks = authData.callbacks;
    if (callbacks && Array.isArray(callbacks)) {
      callbacks = JSON.parse(JSON.stringify(callbacks));
      for (const cb of callbacks) {
        if (cb.type === 'PasswordCallback' && Array.isArray(cb.input)) {
          for (const inp of cb.input) {
            if (inp.name === 'IDToken1') inp.value = cleanOtp;
          }
        } else if (cb.type === 'ConfirmationCallback' && Array.isArray(cb.input)) {
          for (const inp of cb.input) {
            if (inp.name === 'IDToken2') inp.value = 0;
          }
        }
      }
    } else {
      callbacks = [
        {
          type: 'PasswordCallback',
          output: [{ name: 'prompt', value: 'One Time Password' }],
          input: [{ name: 'IDToken1', value: cleanOtp }],
        },
        {
          type: 'ConfirmationCallback',
          output: [
            { name: 'prompt', value: '' },
            { name: 'messageType', value: 0 },
            { name: 'options', value: ['Submit OTP', 'Request OTP'] },
            { name: 'optionType', value: -1 },
            { name: 'defaultOption', value: 0 },
          ],
          input: [{ name: 'IDToken2', value: 0 }],
        },
      ];
    }

    const authUrl = `${this.CIAM_HOST}/iam/v1/realms/tsel/authenticate?authIndexType=service&authIndexValue=phoneLogin`;
    const resp = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'AM-CLIENTID': this.CIAM_CLIENT_ID,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Origin': 'https://my.telkomsel.com',
        'Referer': 'https://my.telkomsel.com/',
        'User-Agent': this.USER_AGENT,
      },
      body: JSON.stringify({
        authId: authData.authId,
        callbacks,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Verifikasi OTP gagal (HTTP ${resp.status}): ${errText}`);
    }

    const authRes = await resp.json();
    if (!authRes.tokenId) {
      const msg = authRes.message || authRes.detail?.errorMsg || 'Kode OTP salah atau kedaluwarsa';
      throw new Error(msg);
    }

    // Step 2: Authorize endpoint to get authorization code
    const authorizeUrl = new URL(`${this.CIAM_HOST}/iam/v1/oauth2/realms/tsel/authorize`);
    authorizeUrl.searchParams.set('client_id', this.CIAM_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', this.CIAM_REDIRECT_URI);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('nonce', 'true');
    authorizeUrl.searchParams.set('scope', this.CIAM_SCOPE);

    // Node fetch: don't automatically follow redirect so we capture Location header code
    const authCodeResp = await fetch(authorizeUrl.toString(), {
      method: 'GET',
      headers: {
        'Origin': 'https://my.telkomsel.com',
        'Referer': 'https://my.telkomsel.com/',
        'User-Agent': this.USER_AGENT,
        'Cookie': `iPlanetDirectoryPro=${authRes.tokenId}`,
      },
      redirect: 'manual',
    });

    let code = null;
    const location = authCodeResp.headers.get('location');
    if (location && location.includes('code=')) {
      const locUrl = new URL(location, 'https://my.telkomsel.com');
      code = locUrl.searchParams.get('code');
    }

    if (!code && authCodeResp.url && authCodeResp.url.includes('code=')) {
      const u = new URL(authCodeResp.url);
      code = u.searchParams.get('code');
    }

    if (!code) {
      throw new Error(`Gagal mendapatkan auth code dari CIAM (Status ${authCodeResp.status}, Location: ${location || 'none'})`);
    }

    // Step 3: Exchange code for tokens
    const tokenUrl = `${this.CIAM_HOST}/iam/v1/oauth2/realms/tsel/access_token`;
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.CIAM_CLIENT_ID,
      client_secret: this.CIAM_CLIENT_SECRET,
      redirect_uri: this.CIAM_REDIRECT_URI,
      code,
      response_type: 'code',
    });

    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Origin': 'https://my.telkomsel.com',
        'Referer': 'https://my.telkomsel.com/',
        'User-Agent': this.USER_AGENT,
      },
      body: tokenParams.toString(),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      throw new Error(`Gagal menukar token (HTTP ${tokenResp.status}): ${errText}`);
    }

    const tokenData = await tokenResp.json();
    tokenData.msisdn = authData.msisdn;
    tokenData.device_uuid = crypto.randomUUID();
    tokenData.acquired_at = Date.now();
    return tokenData;
  }

  async refreshToken(tokens) {
    if (!tokens || !tokens.refresh_token) {
      throw new Error('Refresh token tidak tersedia.');
    }

    const tokenUrl = `${this.CIAM_HOST}/iam/v1/oauth2/realms/tsel/access_token`;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.CIAM_CLIENT_ID,
      client_secret: this.CIAM_CLIENT_SECRET,
      redirect_uri: this.CIAM_REDIRECT_URI,
      refresh_token: tokens.refresh_token,
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Origin': 'https://my.telkomsel.com',
        'Referer': 'https://my.telkomsel.com/',
        'User-Agent': this.USER_AGENT,
      },
      body: params.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gagal merefresh token (HTTP ${resp.status}): ${err}`);
    }

    const newTokens = await resp.json();
    return {
      ...tokens,
      access_token: newTokens.access_token || tokens.access_token,
      id_token: newTokens.id_token || tokens.id_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      acquired_at: Date.now(),
    };
  }

  getApiHeaders(tokens, endpoint) {
    const idToken = tokens.id_token || '';
    const accessToken = tokens.access_token || '';
    const msisdn = tokens.msisdn || '';
    const deviceUuid = tokens.device_uuid || crypto.randomUUID();

    const nowUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const idPayload = JSON.stringify({ token: idToken, timestamp: nowUtc });
    const accessPayload = JSON.stringify({ accessToken: accessToken, timestamp: nowUtc });

    const encId = this.encryptAes128Ofb(idPayload);
    const encAccess = this.encryptAes128Ofb(accessPayload);

    const txId = this.generateTransactionId(msisdn);
    const reqHash = this.generateHash(txId, endpoint);

    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'authserver': '2',
      'CHANNELID': 'WEB',
      'language': 'id',
      'MYTELKOMSEL-WEB-APP-VERSION': this.APP_VERSION,
      'x-device': deviceUuid,
      'Authorization': `Bearer ${encId}`,
      'AccessAuthorization': `Bearer ${encAccess}`,
      'web-msisdn': msisdn,
      'TRANSACTIONID': txId,
      'HASH': reqHash,
      'Origin': 'https://my.telkomsel.com',
      'Referer': 'https://my.telkomsel.com/',
      'User-Agent': this.USER_AGENT,
    };
  }

  async callApi(tokens, endpoint, method = 'GET', body = null) {
    const fullUrl = `${this.API_HOST}${endpoint}`;
    let headers = this.getApiHeaders(tokens, endpoint);

    let resp = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (resp.status === 401 && tokens.refresh_token) {
      console.log('🔄 Token 401 Unauthorized, mencoba refresh token Telkomsel...');
      try {
        const refreshed = await this.refreshToken(tokens);
        Object.assign(tokens, refreshed);
        headers = this.getApiHeaders(tokens, endpoint);
        resp = await fetch(fullUrl, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (refreshErr) {
        console.error('Gagal refresh token otomatis:', refreshErr.message);
        throw new Error('Sesi Telkomsel telah kedaluwarsa. Silakan login ulang via OTP.');
      }
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API Error (HTTP ${resp.status}) pada ${endpoint}: ${errText}`);
    }

    const json = await resp.json();
    return json.data !== undefined ? json.data : json;
  }

  async getProfileBalance(tokens) {
    return this.callApi(tokens, 'subscriber/profile-balance', 'GET');
  }

  async getUserProfile(tokens) {
    return this.callApi(tokens, 'subscriber/v5/profile', 'GET');
  }

  async getBonuses(tokens, isPrepaid = true, location = '') {
    try {
      return await this.callApi(tokens, 'subscriber/v5/bonuses', 'POST', {
        isPrepaid,
        location: location || '',
        roaming: false,
      });
    } catch (err) {
      // Fallback v4
      return await this.callApi(tokens, 'subscriber/v4/bonuses', 'POST', {
        location: location || '',
      });
    }
  }

  async fetchFullTelkomselStatus(tokens) {
    let balanceData = {};
    let profileData = {};
    let bonusData = {};

    try {
      balanceData = await this.getProfileBalance(tokens);
    } catch (e) {
      console.warn('Gagal mengambil balance:', e.message);
    }

    try {
      profileData = await this.getUserProfile(tokens);
    } catch (e) {
      console.warn('Gagal mengambil profile:', e.message);
    }

    const prof = profileData?.profiles || {};
    const isPrepaid = prof.isPrepaid !== undefined ? prof.isPrepaid : true;
    const location = prof.location || '';

    try {
      bonusData = await this.getBonuses(tokens, isPrepaid, location);
    } catch (e) {
      console.warn('Gagal mengambil bonus kuota:', e.message);
    }

    // Process and normalize quota items
    const rawGroups = bonusData?.userBonuses || [];
    const quotaGroups = [];
    let primaryDataRemaining = '0 GB';
    let primaryDataTotal = '';
    let primaryDataPercent = 0;

    for (const group of rawGroups) {
      const bClass = group.class || 'DATA';
      const totalText = group.totalText || group.total || '0';
      const totalQuotaText = group.totalQuotaText || '';
      const unusedPercent = Number(group.unusedpercent || 0);

      const items = (group.bonusList || []).map((item) => ({
        name: item.bucketdescription || item.name || 'Paket Internet',
        remaining: item.remainingquota || '0',
        total: item.totalQuota || '',
        expiryDate: item.expirydate || '',
        warning: item.thresholdInfo?.warningText || '',
      }));

      quotaGroups.push({
        category: bClass,
        label: this.getCategoryLabel(bClass),
        totalRemaining: totalText,
        totalQuota: totalQuotaText,
        remainingPercent: unusedPercent,
        items,
      });

      if (bClass === 'DATA' && (totalText !== '0 GB' || items.length > 0)) {
        primaryDataRemaining = totalText;
        primaryDataTotal = totalQuotaText;
        primaryDataPercent = unusedPercent;
      }
    }

    return {
      msisdn: tokens.msisdn,
      balance: balanceData.balance !== undefined ? balanceData.balance : 0,
      balanceUnit: balanceData.unit || 'IDR',
      expiredDate: balanceData.expired_date || balanceData.expiry_date || null,
      subscriptionType: isPrepaid ? 'PraBayar' : 'PascaBayar',
      brand: prof.brand || 'Telkomsel',
      priceplan: prof.priceplan || '',
      location: prof.location || '',
      primaryQuota: {
        remaining: primaryDataRemaining,
        total: primaryDataTotal,
        percent: primaryDataPercent,
      },
      quotaGroups,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  getCategoryLabel(cat) {
    switch (cat) {
      case 'DATA':
        return 'Internet & Data';
      case 'ENTERTAINMENT':
        return 'Entertainment & Apps';
      case 'VOICE':
        return 'Telepon / Voice';
      case 'SMS':
        return 'SMS';
      case 'MONETARY':
        return 'Saldo Moneter';
      default:
        return cat;
    }
  }
}

module.exports = new TelkomselService();
