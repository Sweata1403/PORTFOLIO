import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mime from 'mime-types';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import {
  createOwner,
  createSession,
  deleteStoredFile,
  destroySession,
  getDb,
  getSessionByToken,
  getSetting,
  hasAnyOwner,
  incrementMetric,
  initDb,
  logAudit,
  nowIso,
  parseJson,
  projectRoot,
  pruneExpiredSessions,
  registerStoredFile,
  setSetting,
  slugify,
  touchSession,
  uploadDir
} from './db.js';

dotenv.config();
initDb();
const db = getDb();

const app = express();
const port = Number(process.env.PORT || 4000);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'sweata_session';
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS || 24 * 7);
const setupKey = process.env.SETUP_KEY || '';
const isProduction = process.env.NODE_ENV === 'production';
const distDir = path.join(projectRoot, 'client', 'dist');
const distIndexPath = path.join(distDir, 'index.html');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => {
      callback(null, `${Date.now()}-${nanoid(12)}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === clientOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin rejected.'));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

const publicMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

app.use('/api', generalLimiter);
setInterval(pruneExpiredSessions, 60 * 60 * 1000).unref();

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizePlain(value, maxLength = 1000) {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {}
  })
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function sanitizeLongText(value, maxLength = 12000) {
  return sanitizePlain(value, maxLength);
}

function sanitizeStringArray(values, maxItems = 20, maxLength = 120) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((item) => sanitizePlain(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function parseArrayField(value, fallback = []) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  return parseJson(value, fallback);
}

function normalizeUrl(value, { allowEmpty = true } = {}) {
  const trimmed = sanitizePlain(value, 400);
  if (!trimmed) {
    return allowEmpty ? '' : null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }
    return parsed.toString();
  } catch {
    return allowEmpty ? '' : null;
  }
}

function sanitizeSocialLinks(value) {
  const links = parseArrayField(value, []);
  if (!Array.isArray(links)) {
    return [];
  }

  return links
    .map((link) => ({
      label: sanitizePlain(link?.label, 40),
      url: normalizeUrl(link?.url)
    }))
    .filter((link) => link.label && link.url)
    .slice(0, 8);
}

function removeTempFile(file) {
  if (file?.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
}

function ensureAllowedUpload(file, allowedMimeTypes, label) {
  if (!file) {
    return;
  }

  const mimeType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';
  if (!allowedMimeTypes.includes(mimeType)) {
    removeTempFile(file);
    throw createHttpError(`Unsupported ${label} file type.`, 400);
  }
}

function registerUploadedFile(file, { visibility = 'private', sourceKind = 'generic' } = {}) {
  return registerStoredFile({
    existingStorageKey: path.basename(file.path),
    originalName: file.originalname,
    mimeType: file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream',
    sizeBytes: file.size,
    visibility,
    sourceKind
  });
}

function setSessionCookie(res, token) {
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: sessionTtlHours * 60 * 60 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  });
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function getOwnerByEmail(email) {
  return db.prepare('SELECT * FROM owners WHERE email = ?').get(String(email).trim().toLowerCase()) || null;
}

function getFileRecord(fileId) {
  if (!fileId) {
    return null;
  }

  return db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) || null;
}

function serializeFile(file, { allowPrivate = false } = {}) {
  if (!file) {
    return null;
  }

  if (file.visibility !== 'public' && !allowPrivate) {
    return null;
  }

  return {
    id: file.id,
    originalName: file.original_name,
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    visibility: file.visibility,
    sourceKind: file.source_kind,
    url: `/api/files/${file.id}/view`,
    downloadUrl: `/api/files/${file.id}/download`
  };
}

function loadProfile({ allowPrivate = false } = {}) {
  const profile = getSetting('site_profile', {});
  return {
    ...profile,
    summary: Array.isArray(profile.summary) ? profile.summary : [],
    focusAreas: Array.isArray(profile.focusAreas) ? profile.focusAreas : [],
    socialLinks: Array.isArray(profile.socialLinks) ? profile.socialLinks : [],
    profileImage: serializeFile(getFileRecord(profile.profileImageFileId), { allowPrivate }),
    resume: serializeFile(getFileRecord(profile.resumeFileId), { allowPrivate })
  };
}

function loadContact({ allowPrivate = false } = {}) {
  const contact = getSetting('site_contact', {});
  return {
    ...contact,
    resume: serializeFile(getFileRecord(contact.resumeFileId), { allowPrivate })
  };
}

function loadExperiences() {
  return db
    .prepare('SELECT * FROM experiences ORDER BY sort_order ASC, start_date DESC')
    .all()
    .map((item) => ({
      id: item.id,
      company: item.company,
      role: item.role,
      location: item.location,
      startDate: item.start_date,
      endDate: item.end_date,
      isCurrent: Boolean(item.is_current),
      summary: item.summary,
      highlights: parseJson(item.highlights_json, []),
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
}

function loadProjects() {
  return db
    .prepare('SELECT * FROM projects ORDER BY featured DESC, sort_order ASC, created_at DESC')
    .all()
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      category: item.category,
      period: item.period,
      summary: item.summary,
      description: item.description,
      techStack: parseJson(item.tech_stack_json, []),
      liveUrl: item.live_url || '',
      repoUrl: item.repo_url || '',
      featured: Boolean(item.featured),
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
}

function loadSkillGroups() {
  return db
    .prepare('SELECT * FROM skill_groups ORDER BY sort_order ASC, created_at ASC')
    .all()
    .map((group) => ({
      id: group.id,
      title: group.title,
      items: parseJson(group.items_json, []),
      sortOrder: group.sort_order,
      createdAt: group.created_at,
      updatedAt: group.updated_at
    }));
}

function loadCertificates() {
  return db
    .prepare('SELECT * FROM certificates ORDER BY sort_order ASC, issue_date DESC, created_at DESC')
    .all()
    .map((item) => ({
      id: item.id,
      title: item.title,
      issuer: item.issuer,
      issueDate: item.issue_date,
      credentialId: item.credential_id || '',
      credentialUrl: item.credential_url || '',
      summary: item.summary,
      skills: parseJson(item.skills_json, []),
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
}

function loadContactMessages() {
  return db
    .prepare('SELECT * FROM contact_messages ORDER BY created_at DESC')
    .all()
    .map((message) => ({
      id: message.id,
      name: message.name,
      email: message.email,
      company: message.company,
      message: message.message,
      isRead: Boolean(message.is_read),
      repliedAt: message.replied_at,
      createdAt: message.created_at
    }));
}

function loadMetrics() {
  const rows = db.prepare('SELECT key, value FROM metrics').all();
  const metrics = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    homepageViews: metrics.homepage_views ?? 0,
    contactMessages: metrics.contact_messages ?? 0
  };
}

function loadAuditLogs(limit = 12) {
  return db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit)
    .map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entity_type,
      entityId: item.entity_id,
      summary: item.summary,
      createdAt: item.created_at
    }));
}

function getDashboardData() {
  const experiences = loadExperiences();
  const projects = loadProjects();
  const skillGroups = loadSkillGroups();
  const certificates = loadCertificates();
  const messages = loadContactMessages();

  return {
    profile: loadProfile({ allowPrivate: true }),
    contact: loadContact({ allowPrivate: true }),
    experiences,
    projects,
    skillGroups,
    certificates,
    messages,
    metrics: loadMetrics(),
    overview: {
      counts: {
        experiences: experiences.length,
        projects: projects.length,
        skillGroups: skillGroups.length,
        certificates: certificates.length,
        messages: messages.length,
        unreadMessages: messages.filter((message) => !message.isRead).length
      }
    },
    auditLogs: loadAuditLogs()
  };
}

function getPublicBootstrap({ countView = false } = {}) {
  if (countView) {
    incrementMetric('homepage_views', 1);
  }

  return {
    profile: loadProfile({ allowPrivate: false }),
    contact: loadContact({ allowPrivate: false }),
    experiences: loadExperiences(),
    projects: loadProjects(),
    skillGroups: loadSkillGroups(),
    certificates: loadCertificates(),
    metrics: loadMetrics()
  };
}

function ensureUniqueProjectSlug(proposed, excludeId = null) {
  const base = slugify(proposed);
  let candidate = base;
  let index = 2;

  while (true) {
    const row = excludeId
      ? db.prepare('SELECT id FROM projects WHERE slug = ? AND id != ?').get(candidate, excludeId)
      : db.prepare('SELECT id FROM projects WHERE slug = ?').get(candidate);

    if (!row) {
      return candidate;
    }

    candidate = `${base}-${index}`;
    index += 1;
  }
}

const profileSchema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  headline: z.string().min(1).max(220),
  location: z.string().min(1).max(120),
  email: z.string().email().max(120),
  phone: z.string().max(40),
  summary: z.array(z.string().min(1).max(400)).min(1).max(6),
  focusAreas: z.array(z.string().min(1).max(60)).min(1).max(10),
  availabilityNote: z.string().max(220),
  socialLinks: z.array(
    z.object({
      label: z.string().min(1).max(40),
      url: z.string().url().max(400)
    })
  ).max(8)
});

const experienceSchema = z.object({
  company: z.string().min(1).max(140),
  role: z.string().min(1).max(140),
  location: z.string().max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}$/),
  endDate: z.string().max(7),
  isCurrent: z.boolean(),
  summary: z.string().min(1).max(500),
  highlights: z.array(z.string().min(1).max(240)).min(1).max(8),
  sortOrder: z.number().int().min(0).max(999)
});

const projectSchema = z.object({
  title: z.string().min(1).max(140),
  category: z.string().max(80),
  period: z.string().max(40),
  summary: z.string().min(1).max(260),
  description: z.string().max(4000),
  techStack: z.array(z.string().min(1).max(60)).max(16),
  liveUrl: z.union([z.literal(''), z.string().url().max(400)]),
  repoUrl: z.union([z.literal(''), z.string().url().max(400)]),
  featured: z.boolean(),
  sortOrder: z.number().int().min(0).max(999)
});

const skillGroupSchema = z.object({
  title: z.string().min(1).max(80),
  items: z.array(z.string().min(1).max(60)).min(1).max(20),
  sortOrder: z.number().int().min(0).max(999)
});

const certificateSchema = z.object({
  title: z.string().min(1).max(140),
  issuer: z.string().min(1).max(140),
  issueDate: z.string().regex(/^\d{4}-\d{2}$/),
  credentialId: z.string().max(120),
  credentialUrl: z.union([z.literal(''), z.string().url().max(400)]),
  summary: z.string().min(1).max(500),
  skills: z.array(z.string().min(1).max(60)).max(16),
  sortOrder: z.number().int().min(0).max(999)
});

const publicContactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(120),
  company: z.string().max(120),
  message: z.string().min(10).max(2000)
});

const messagePatchSchema = z.object({
  isRead: z.boolean()
});

app.use((req, res, next) => {
  const token = req.cookies?.[sessionCookieName];
  if (!token) {
    req.auth = null;
    next();
    return;
  }

  const session = getSessionByToken(token);
  if (!session) {
    clearSessionCookie(res);
    req.auth = null;
    next();
    return;
  }

  if (session.expires_at <= nowIso()) {
    destroySession(token);
    clearSessionCookie(res);
    req.auth = null;
    next();
    return;
  }

  touchSession(session.id);
  req.auth = {
    token,
    sessionId: session.id,
    csrfToken: session.csrf_token,
    owner: {
      id: session.owner_id,
      email: session.email,
      name: session.name
    }
  };
  next();
});

function requireAuth(req, _res, next) {
  if (!req.auth) {
    next(createHttpError('Authentication required.', 401));
    return;
  }

  next();
}

function requireCsrf(req, _res, next) {
  const headerToken = req.get('x-csrf-token');
  if (!req.auth || !headerToken || headerToken !== req.auth.csrfToken) {
    next(createHttpError('Invalid CSRF token.', 403));
    return;
  }

  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/session', (req, res) => {
  if (!req.auth) {
    res.json({ authenticated: false, setupRequired: !hasAnyOwner() });
    return;
  }

  res.json({
    authenticated: true,
    setupRequired: false,
    csrfToken: req.auth.csrfToken,
    owner: req.auth.owner
  });
});

app.post(
  '/api/auth/setup',
  authLimiter,
  asyncRoute(async (req, res) => {
    if (hasAnyOwner()) {
      throw createHttpError('An owner account already exists.', 400);
    }

    if (setupKey && sanitizePlain(req.body?.setupKey, 120) !== setupKey) {
      throw createHttpError('Invalid setup key.', 403);
    }

    const email = sanitizePlain(req.body?.email, 120).toLowerCase();
    const name = sanitizePlain(req.body?.name, 120);
    const password = String(req.body?.password ?? '').trim();

    if (!email || !name || password.length < 8) {
      throw createHttpError('Name, email, and a password of at least 8 characters are required.', 400);
    }

    const owner = createOwner({ email, name, password });
    const session = createSession(owner.id, {
      userAgent: req.get('user-agent') || '',
      ipAddress: req.ip,
      ttlHours: sessionTtlHours
    });

    logAudit({
      actorOwnerId: owner.id,
      action: 'setup_owner',
      entityType: 'owner',
      entityId: owner.id,
      summary: 'Created the initial owner account.'
    });

    setSessionCookie(res, session.token);
    res.status(201).json({
      authenticated: true,
      setupRequired: false,
      csrfToken: session.csrfToken,
      owner
    });
  })
);

app.post(
  '/api/auth/login',
  authLimiter,
  asyncRoute(async (req, res) => {
    const email = sanitizePlain(req.body?.email, 120).toLowerCase();
    const password = String(req.body?.password ?? '');

    const owner = getOwnerByEmail(email);
    if (!owner || !bcrypt.compareSync(password, owner.password_hash)) {
      throw createHttpError('Invalid email or password.', 401);
    }

    const session = createSession(owner.id, {
      userAgent: req.get('user-agent') || '',
      ipAddress: req.ip,
      ttlHours: sessionTtlHours
    });

    logAudit({
      actorOwnerId: owner.id,
      action: 'login',
      entityType: 'session',
      entityId: session.id,
      summary: 'Signed into the dashboard.'
    });

    setSessionCookie(res, session.token);
    res.json({
      authenticated: true,
      setupRequired: false,
      csrfToken: session.csrfToken,
      owner: {
        id: owner.id,
        email: owner.email,
        name: owner.name
      }
    });
  })
);

app.post('/api/auth/logout', (req, res) => {
  if (req.auth?.token) {
    destroySession(req.auth.token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/public/bootstrap', (req, res) => {
  const countView = ['1', 'true', 'yes'].includes(String(req.query.countView || '').toLowerCase());
  res.json(getPublicBootstrap({ countView }));
});

app.post(
  '/api/public/contact',
  publicMutationLimiter,
  asyncRoute(async (req, res) => {
    const payload = publicContactSchema.parse({
      name: sanitizePlain(req.body?.name, 120),
      email: sanitizePlain(req.body?.email, 120).toLowerCase(),
      company: sanitizePlain(req.body?.company, 120),
      message: sanitizeLongText(req.body?.message, 2000)
    });

    const id = `message_${nanoid(12)}`;
    db.prepare(
      `INSERT INTO contact_messages (id, name, email, company, message, is_read, replied_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`
    ).run(id, payload.name, payload.email, payload.company, payload.message, nowIso());

    incrementMetric('contact_messages', 1);
    logAudit({
      action: 'contact_message_created',
      entityType: 'contact_message',
      entityId: id,
      summary: `Received a contact message from ${payload.name}.`
    });

    res.status(201).json({ ok: true });
  })
);

app.get(
  '/api/admin/dashboard',
  requireAuth,
  requireCsrf,
  asyncRoute(async (_req, res) => {
    res.json(getDashboardData());
  })
);

app.put(
  '/api/admin/profile',
  requireAuth,
  requireCsrf,
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'resume', maxCount: 1 }
  ]),
  asyncRoute(async (req, res) => {
    const incoming = profileSchema.parse({
      name: sanitizePlain(req.body?.name, 120),
      title: sanitizePlain(req.body?.title, 120),
      headline: sanitizePlain(req.body?.headline, 220),
      location: sanitizePlain(req.body?.location, 120),
      email: sanitizePlain(req.body?.email, 120).toLowerCase(),
      phone: sanitizePlain(req.body?.phone, 40),
      summary: sanitizeStringArray(parseArrayField(req.body?.summary, []), 6, 400),
      focusAreas: sanitizeStringArray(parseArrayField(req.body?.focusAreas, []), 10, 60),
      availabilityNote: sanitizePlain(req.body?.availabilityNote, 220),
      socialLinks: sanitizeSocialLinks(req.body?.socialLinks)
    });

    const existingProfile = getSetting('site_profile', {});
    const existingContact = getSetting('site_contact', {});
    const files = req.files || {};
    const profileImageFile = files.profileImage?.[0];
    const resumeFile = files.resume?.[0];

    if (profileImageFile) {
      ensureAllowedUpload(profileImageFile, ['image/jpeg', 'image/png', 'image/webp'], 'profile image');
    }
    if (resumeFile) {
      ensureAllowedUpload(resumeFile, ['application/pdf'], 'resume');
    }

    let profileImageFileId = existingProfile.profileImageFileId || null;
    let resumeFileId = existingProfile.resumeFileId || existingContact.resumeFileId || null;

    if (profileImageFile) {
      profileImageFileId = registerUploadedFile(profileImageFile, {
        visibility: 'public',
        sourceKind: 'profile_image'
      });
    }

    if (resumeFile) {
      resumeFileId = registerUploadedFile(resumeFile, {
        visibility: 'public',
        sourceKind: 'resume'
      });
    }

    const updatedProfile = {
      ...incoming,
      profileImageFileId,
      resumeFileId
    };

    const updatedContact = {
      headline: sanitizePlain(existingContact.headline || '', 220),
      email: incoming.email,
      phone: incoming.phone,
      location: incoming.location,
      resumeFileId
    };

    setSetting('site_profile', updatedProfile);
    setSetting('site_contact', updatedContact);

    if (profileImageFile && existingProfile.profileImageFileId && existingProfile.profileImageFileId !== profileImageFileId) {
      deleteStoredFile(existingProfile.profileImageFileId);
    }

    if (
      resumeFile &&
      existingProfile.resumeFileId &&
      existingProfile.resumeFileId !== resumeFileId &&
      existingProfile.resumeFileId !== existingProfile.profileImageFileId
    ) {
      deleteStoredFile(existingProfile.resumeFileId);
    }

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'profile_updated',
      entityType: 'settings',
      entityId: 'site_profile',
      summary: 'Updated portfolio profile information.'
    });

    res.json({
      profile: loadProfile({ allowPrivate: true }),
      contact: loadContact({ allowPrivate: true })
    });
  })
);

app.put(
  '/api/admin/contact',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const profile = getSetting('site_profile', {});
    const updatedContact = {
      headline: sanitizePlain(req.body?.headline, 220),
      email: sanitizePlain(req.body?.email, 120).toLowerCase(),
      phone: sanitizePlain(req.body?.phone, 40),
      location: sanitizePlain(req.body?.location, 120),
      resumeFileId: profile.resumeFileId || null
    };

    setSetting('site_contact', updatedContact);
    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'contact_updated',
      entityType: 'settings',
      entityId: 'site_contact',
      summary: 'Updated public contact information.'
    });

    res.json({ contact: loadContact({ allowPrivate: true }) });
  })
);

app.post(
  '/api/admin/experiences',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const payload = experienceSchema.parse({
      company: sanitizePlain(req.body?.company, 140),
      role: sanitizePlain(req.body?.role, 140),
      location: sanitizePlain(req.body?.location, 120),
      startDate: sanitizePlain(req.body?.startDate, 7),
      endDate: sanitizePlain(req.body?.endDate, 7),
      isCurrent: Boolean(req.body?.isCurrent),
      summary: sanitizePlain(req.body?.summary, 500),
      highlights: sanitizeStringArray(parseArrayField(req.body?.highlights, []), 8, 240),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    const id = `exp_${nanoid(12)}`;
    const timestamp = nowIso();

    db.prepare(
      `INSERT INTO experiences (
         id, company, role, location, start_date, end_date, is_current, summary, highlights_json, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      payload.company,
      payload.role,
      payload.location,
      payload.startDate,
      payload.endDate,
      payload.isCurrent ? 1 : 0,
      payload.summary,
      JSON.stringify(payload.highlights),
      payload.sortOrder,
      timestamp,
      timestamp
    );

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'experience_created',
      entityType: 'experience',
      entityId: id,
      summary: `Created experience entry for ${payload.company}.`
    });

    res.status(201).json({ experiences: loadExperiences() });
  })
);

app.put(
  '/api/admin/experiences/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT id FROM experiences WHERE id = ?').get(req.params.id);
    if (!existing) {
      throw createHttpError('Experience not found.', 404);
    }

    const payload = experienceSchema.parse({
      company: sanitizePlain(req.body?.company, 140),
      role: sanitizePlain(req.body?.role, 140),
      location: sanitizePlain(req.body?.location, 120),
      startDate: sanitizePlain(req.body?.startDate, 7),
      endDate: sanitizePlain(req.body?.endDate, 7),
      isCurrent: Boolean(req.body?.isCurrent),
      summary: sanitizePlain(req.body?.summary, 500),
      highlights: sanitizeStringArray(parseArrayField(req.body?.highlights, []), 8, 240),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    db.prepare(
      `UPDATE experiences
       SET company = ?, role = ?, location = ?, start_date = ?, end_date = ?, is_current = ?, summary = ?, highlights_json = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      payload.company,
      payload.role,
      payload.location,
      payload.startDate,
      payload.endDate,
      payload.isCurrent ? 1 : 0,
      payload.summary,
      JSON.stringify(payload.highlights),
      payload.sortOrder,
      nowIso(),
      req.params.id
    );

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'experience_updated',
      entityType: 'experience',
      entityId: req.params.id,
      summary: `Updated experience entry for ${payload.company}.`
    });

    res.json({ experiences: loadExperiences() });
  })
);

app.delete(
  '/api/admin/experiences/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    db.prepare('DELETE FROM experiences WHERE id = ?').run(req.params.id);
    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'experience_deleted',
      entityType: 'experience',
      entityId: req.params.id,
      summary: 'Deleted an experience entry.'
    });
    res.json({ experiences: loadExperiences() });
  })
);

app.post(
  '/api/admin/projects',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const payload = projectSchema.parse({
      title: sanitizePlain(req.body?.title, 140),
      category: sanitizePlain(req.body?.category, 80),
      period: sanitizePlain(req.body?.period, 40),
      summary: sanitizePlain(req.body?.summary, 260),
      description: sanitizeLongText(req.body?.description, 4000),
      techStack: sanitizeStringArray(parseArrayField(req.body?.techStack, []), 16, 60),
      liveUrl: normalizeUrl(req.body?.liveUrl),
      repoUrl: normalizeUrl(req.body?.repoUrl),
      featured: Boolean(req.body?.featured),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    const id = `project_${nanoid(12)}`;
    const timestamp = nowIso();
    const slug = ensureUniqueProjectSlug(payload.title);

    db.prepare(
      `INSERT INTO projects (
         id, slug, title, category, period, summary, description, tech_stack_json, live_url, repo_url, featured, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      slug,
      payload.title,
      payload.category,
      payload.period,
      payload.summary,
      payload.description,
      JSON.stringify(payload.techStack),
      payload.liveUrl,
      payload.repoUrl,
      payload.featured ? 1 : 0,
      payload.sortOrder,
      timestamp,
      timestamp
    );

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'project_created',
      entityType: 'project',
      entityId: id,
      summary: `Created project ${payload.title}.`
    });

    res.status(201).json({ projects: loadProjects() });
  })
);

app.put(
  '/api/admin/projects/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) {
      throw createHttpError('Project not found.', 404);
    }

    const payload = projectSchema.parse({
      title: sanitizePlain(req.body?.title, 140),
      category: sanitizePlain(req.body?.category, 80),
      period: sanitizePlain(req.body?.period, 40),
      summary: sanitizePlain(req.body?.summary, 260),
      description: sanitizeLongText(req.body?.description, 4000),
      techStack: sanitizeStringArray(parseArrayField(req.body?.techStack, []), 16, 60),
      liveUrl: normalizeUrl(req.body?.liveUrl),
      repoUrl: normalizeUrl(req.body?.repoUrl),
      featured: Boolean(req.body?.featured),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    const slug = ensureUniqueProjectSlug(payload.title, req.params.id);

    db.prepare(
      `UPDATE projects
       SET slug = ?, title = ?, category = ?, period = ?, summary = ?, description = ?, tech_stack_json = ?, live_url = ?, repo_url = ?, featured = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      slug,
      payload.title,
      payload.category,
      payload.period,
      payload.summary,
      payload.description,
      JSON.stringify(payload.techStack),
      payload.liveUrl,
      payload.repoUrl,
      payload.featured ? 1 : 0,
      payload.sortOrder,
      nowIso(),
      req.params.id
    );

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'project_updated',
      entityType: 'project',
      entityId: req.params.id,
      summary: `Updated project ${payload.title}.`
    });

    res.json({ projects: loadProjects() });
  })
);

app.delete(
  '/api/admin/projects/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'project_deleted',
      entityType: 'project',
      entityId: req.params.id,
      summary: 'Deleted a project entry.'
    });
    res.json({ projects: loadProjects() });
  })
);

app.post(
  '/api/admin/certificates',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const payload = certificateSchema.parse({
      title: sanitizePlain(req.body?.title, 140),
      issuer: sanitizePlain(req.body?.issuer, 140),
      issueDate: sanitizePlain(req.body?.issueDate, 7),
      credentialId: sanitizePlain(req.body?.credentialId, 120),
      credentialUrl: normalizeUrl(req.body?.credentialUrl),
      summary: sanitizePlain(req.body?.summary, 500),
      skills: sanitizeStringArray(parseArrayField(req.body?.skills, []), 16, 60),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    const id = `certificate_${nanoid(12)}`;
    const timestamp = nowIso();

    db.prepare(
      `INSERT INTO certificates (
         id, title, issuer, issue_date, credential_id, credential_url, summary, skills_json, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      payload.title,
      payload.issuer,
      payload.issueDate,
      payload.credentialId,
      payload.credentialUrl,
      payload.summary,
      JSON.stringify(payload.skills),
      payload.sortOrder,
      timestamp,
      timestamp
    );

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'certificate_created',
      entityType: 'certificate',
      entityId: id,
      summary: `Created certificate ${payload.title}.`
    });

    res.status(201).json({ certificates: loadCertificates() });
  })
);

app.put(
  '/api/admin/certificates/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT id FROM certificates WHERE id = ?').get(req.params.id);
    if (!existing) {
      throw createHttpError('Certificate not found.', 404);
    }

    const payload = certificateSchema.parse({
      title: sanitizePlain(req.body?.title, 140),
      issuer: sanitizePlain(req.body?.issuer, 140),
      issueDate: sanitizePlain(req.body?.issueDate, 7),
      credentialId: sanitizePlain(req.body?.credentialId, 120),
      credentialUrl: normalizeUrl(req.body?.credentialUrl),
      summary: sanitizePlain(req.body?.summary, 500),
      skills: sanitizeStringArray(parseArrayField(req.body?.skills, []), 16, 60),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    db.prepare(
      `UPDATE certificates
       SET title = ?, issuer = ?, issue_date = ?, credential_id = ?, credential_url = ?, summary = ?, skills_json = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      payload.title,
      payload.issuer,
      payload.issueDate,
      payload.credentialId,
      payload.credentialUrl,
      payload.summary,
      JSON.stringify(payload.skills),
      payload.sortOrder,
      nowIso(),
      req.params.id
    );

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'certificate_updated',
      entityType: 'certificate',
      entityId: req.params.id,
      summary: `Updated certificate ${payload.title}.`
    });

    res.json({ certificates: loadCertificates() });
  })
);

app.delete(
  '/api/admin/certificates/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    db.prepare('DELETE FROM certificates WHERE id = ?').run(req.params.id);
    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'certificate_deleted',
      entityType: 'certificate',
      entityId: req.params.id,
      summary: 'Deleted a certificate entry.'
    });
    res.json({ certificates: loadCertificates() });
  })
);

app.post(
  '/api/admin/skill-groups',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const payload = skillGroupSchema.parse({
      title: sanitizePlain(req.body?.title, 80),
      items: sanitizeStringArray(parseArrayField(req.body?.items, []), 20, 60),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    const id = `skill_group_${nanoid(12)}`;
    const timestamp = nowIso();

    db.prepare(
      `INSERT INTO skill_groups (id, title, items_json, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, payload.title, JSON.stringify(payload.items), payload.sortOrder, timestamp, timestamp);

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'skill_group_created',
      entityType: 'skill_group',
      entityId: id,
      summary: `Created skill group ${payload.title}.`
    });

    res.status(201).json({ skillGroups: loadSkillGroups() });
  })
);

app.put(
  '/api/admin/skill-groups/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT id FROM skill_groups WHERE id = ?').get(req.params.id);
    if (!existing) {
      throw createHttpError('Skill group not found.', 404);
    }

    const payload = skillGroupSchema.parse({
      title: sanitizePlain(req.body?.title, 80),
      items: sanitizeStringArray(parseArrayField(req.body?.items, []), 20, 60),
      sortOrder: Number(req.body?.sortOrder ?? 0)
    });

    db.prepare(
      `UPDATE skill_groups
       SET title = ?, items_json = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    ).run(payload.title, JSON.stringify(payload.items), payload.sortOrder, nowIso(), req.params.id);

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'skill_group_updated',
      entityType: 'skill_group',
      entityId: req.params.id,
      summary: `Updated skill group ${payload.title}.`
    });

    res.json({ skillGroups: loadSkillGroups() });
  })
);

app.delete(
  '/api/admin/skill-groups/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    db.prepare('DELETE FROM skill_groups WHERE id = ?').run(req.params.id);
    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'skill_group_deleted',
      entityType: 'skill_group',
      entityId: req.params.id,
      summary: 'Deleted a skill group.'
    });
    res.json({ skillGroups: loadSkillGroups() });
  })
);

app.patch(
  '/api/admin/contact-messages/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    const payload = messagePatchSchema.parse({
      isRead: Boolean(req.body?.isRead)
    });

    db.prepare('UPDATE contact_messages SET is_read = ?, replied_at = ? WHERE id = ?').run(
      payload.isRead ? 1 : 0,
      payload.isRead ? nowIso() : null,
      req.params.id
    );

    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'contact_message_updated',
      entityType: 'contact_message',
      entityId: req.params.id,
      summary: payload.isRead ? 'Marked a contact message as read.' : 'Marked a contact message as unread.'
    });

    res.json({ messages: loadContactMessages() });
  })
);

app.delete(
  '/api/admin/contact-messages/:id',
  requireAuth,
  requireCsrf,
  asyncRoute(async (req, res) => {
    db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);
    logAudit({
      actorOwnerId: req.auth.owner.id,
      action: 'contact_message_deleted',
      entityType: 'contact_message',
      entityId: req.params.id,
      summary: 'Deleted a contact message.'
    });
    res.json({ messages: loadContactMessages() });
  })
);

app.get(
  '/api/files/:id/view',
  asyncRoute(async (req, res) => {
    const file = getFileRecord(req.params.id);
    if (!file) {
      throw createHttpError('File not found.', 404);
    }

    if (file.visibility !== 'public' && !req.auth) {
      throw createHttpError('Authentication required.', 401);
    }

    const absolutePath = path.join(uploadDir, file.storage_key);
    if (!fs.existsSync(absolutePath)) {
      throw createHttpError('File is missing from storage.', 404);
    }

    res.type(file.mime_type || 'application/octet-stream');
    res.sendFile(absolutePath);
  })
);

app.get(
  '/api/files/:id/download',
  asyncRoute(async (req, res) => {
    const file = getFileRecord(req.params.id);
    if (!file) {
      throw createHttpError('File not found.', 404);
    }

    if (file.visibility !== 'public' && !req.auth) {
      throw createHttpError('Authentication required.', 401);
    }

    const absolutePath = path.join(uploadDir, file.storage_key);
    if (!fs.existsSync(absolutePath)) {
      throw createHttpError('File is missing from storage.', 404);
    }

    res.download(absolutePath, file.original_name);
  })
);

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

app.use((req, res, next) => {
  if (!fs.existsSync(distIndexPath)) {
    next();
    return;
  }

  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    next();
    return;
  }

  res.sendFile(distIndexPath);
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message || 'Validation failed.'
    });
    return;
  }

  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error.' : error.message
  });
});

app.listen(port, () => {
  console.log(`Sweata portfolio server listening on http://localhost:${port}`);
});
