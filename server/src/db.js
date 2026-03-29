import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import mime from 'mime-types';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const serverRoot = path.resolve(__dirname, '..');
export const projectRoot = path.resolve(serverRoot, '..');
export const appDataDir = path.join(serverRoot, 'data');
export const storageRoot = path.join(serverRoot, 'storage');
export const uploadDir = path.join(storageRoot, 'uploads');
export const backupDir = path.join(storageRoot, 'backups');
export const seedAssetDir = path.join(serverRoot, 'seed-assets');
export const dbPath = path.join(appDataDir, 'app.db');

let database;

export function nowIso() {
  return new Date().toISOString();
}

export function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

export function slugify(value) {
  const slug = String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `item-${nanoid(6).toLowerCase()}`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function ensureAppDirs() {
  [appDataDir, storageRoot, uploadDir, backupDir].forEach(ensureDir);
}

export function getDb() {
  if (!database) {
    ensureAppDirs();
    database = new Database(dbPath);
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
  }

  return database;
}

function getSeedSource(kind) {
  const defaults = {
    profileImage: path.join(seedAssetDir, 'profile.jpeg'),
    resume: path.join(seedAssetDir, 'resume.pdf')
  };

  if (kind === 'profileImage') {
    return process.env.SEED_PROFILE_IMAGE_SOURCE || defaults.profileImage;
  }

  return process.env.SEED_RESUME_SOURCE || defaults.resume;
}

function hasStoredFile(fileId) {
  if (!fileId) {
    return false;
  }

  const file = getDb().prepare('SELECT storage_key FROM files WHERE id = ?').get(fileId);
  if (!file?.storage_key) {
    return false;
  }

  return fs.existsSync(path.join(uploadDir, file.storage_key));
}

function defaultProfile() {
  return {
    name: 'Sweata Chakraborty',
    title: 'Data Engineer',
    headline: 'Building dependable data systems, cloud-backed workflows, and product-minded internal tools.',
    location: 'Pune, Maharashtra',
    email: 'sweata.personal@gmail.com',
    phone: '+91 80112 88322',
    summary: [
      'I am a dedicated Data Engineer focused on building scalable data solutions with Python and SQL, supported by hands-on experience with AWS and Azure.',
      'My work spans automation, migration workflows, testing, cloud deployment, and frontend-heavy dashboards that make internal systems easier to operate.'
    ],
    focusAreas: [
      'Data Engineering',
      'Python Automation',
      'SQL and ETL',
      'AWS Infrastructure',
      'React Dashboards'
    ],
    availabilityNote:
      'Open to data engineering, platform, and full-stack opportunities where reliable systems and thoughtful execution matter.',
    socialLinks: [
      {
        label: 'LinkedIn',
        url: 'https://www.linkedin.com/in/sweatachakraborty/'
      }
    ],
    profileImageFileId: null,
    resumeFileId: null
  };
}

function defaultContact() {
  return {
    headline: 'If you are hiring, collaborating, or exploring data platform work, the fastest way to reach me is by email.',
    email: 'sweata.personal@gmail.com',
    phone: '+91 80112 88322',
    location: 'Pune, Maharashtra',
    resumeFileId: null
  };
}

function defaultExperiences() {
  return [
    {
      id: 'exp-capgemini',
      company: 'Capgemini India Pvt. Ltd',
      role: 'Software Engineer',
      location: 'Pune, Maharashtra',
      startDate: '2024-11',
      endDate: '',
      isCurrent: 1,
      summary:
        'Working on enterprise migration and cloud execution workflows with a focus on automation, testing, and operational reliability.',
      highlights: [
        'Develop and optimize Python automation scripts that streamline enterprise data migration workflows and reduce manual effort.',
        'Design validation and testing frameworks to maintain data integrity across migration pipelines.',
        'Deploy AWS infrastructure including EC2 and S3 for production-grade data processing environments.',
        'Collaborate across engineering and cloud operations teams to deliver documented, version-controlled solutions.'
      ],
      sortOrder: 0
    },
    {
      id: 'exp-n3clouds',
      company: 'N3Clouds Technologies Pvt. Ltd',
      role: 'MERN Stack Developer Intern',
      location: 'Kolkata, West Bengal',
      startDate: '2024-01',
      endDate: '2024-06',
      isCurrent: 0,
      summary:
        'Built dashboard features and API integrations for a cloud solutions company with a strong focus on React-based interfaces.',
      highlights: [
        'Maintained and enhanced the company admin dashboard for better functionality and performance.',
        'Designed the frontend structure in React and Material UI while integrating GraphQL APIs for dynamic data management.',
        'Built and consumed REST APIs that contributed to backend data flow and application architecture.'
      ],
      sortOrder: 1
    },
    {
      id: 'exp-salesforce',
      company: 'Salesforce',
      role: 'Salesforce Developer Intern',
      location: 'Virtual',
      startDate: '2023-05',
      endDate: '2023-07',
      isCurrent: 0,
      summary:
        'Contributed to CRM workflows, integrations, testing, and issue resolution within a structured enterprise environment.',
      highlights: [
        'Developed and customized Salesforce workflows and data integrations for CRM applications.',
        'Supported data quality testing, issue resolution, and user-facing workflow reliability.'
      ],
      sortOrder: 2
    }
  ];
}

function defaultProjects() {
  return [
    {
      id: 'project-github-migration',
      slug: 'github-saas-migration-automation',
      title: 'GitHub SaaS Migration Automation',
      category: 'Automation',
      period: '2024',
      summary: 'Python automation for repository migration, validation, and reporting across enterprise GitHub environments.',
      description:
        'Built a Python-based automation flow for repository migration with validation, reporting, and AWS-backed execution. The project focused on making enterprise migrations repeatable, traceable, and resilient.',
      techStack: ['Python', 'AWS EC2', 'AWS S3', 'GitHub'],
      liveUrl: '',
      repoUrl: '',
      featured: 1,
      sortOrder: 0
    },
    {
      id: 'project-admin-dashboard',
      slug: 'admin-dashboard',
      title: 'Admin Dashboard',
      category: 'Full Stack',
      period: '2024',
      summary: 'A React-based admin dashboard for dynamic data management and analytics visualization.',
      description:
        'Developed a modular React dashboard with GraphQL integration, responsive navigation, and reusable UI patterns so teams could monitor data and operations from one place.',
      techStack: ['React', 'GraphQL', 'Material UI', 'JavaScript'],
      liveUrl: '',
      repoUrl: '',
      featured: 1,
      sortOrder: 1
    },
    {
      id: 'project-social-media',
      slug: 'social-media-application',
      title: 'Social Media Application',
      category: 'Product Build',
      period: '2024',
      summary: 'A full-stack social media application with authentication, cloud storage, and responsive UI flows.',
      description:
        'Built a social media app using React, Appwrite, Tailwind CSS, and React Query with authentication, database interactions, and cloud file storage wired into the product flow.',
      techStack: ['React', 'Appwrite', 'Tailwind CSS', 'React Query'],
      liveUrl: '',
      repoUrl: '',
      featured: 0,
      sortOrder: 2
    }
  ];
}

function defaultSkillGroups() {
  return [
    {
      id: 'skills-data',
      title: 'Data and Cloud',
      items: ['Python', 'SQL', 'ETL', 'AWS', 'Azure', 'EC2', 'S3', 'AWS Lambda', 'CloudFormation'],
      sortOrder: 0
    },
    {
      id: 'skills-frontend',
      title: 'Frontend and APIs',
      items: ['React', 'JavaScript', 'HTML', 'CSS', 'GraphQL', 'REST APIs', 'Tailwind CSS'],
      sortOrder: 1
    },
    {
      id: 'skills-backend',
      title: 'Backend and Platforms',
      items: ['Node.js', 'Express.js', 'MongoDB', 'NoSQL', 'Salesforce CRM', 'Spring Batch'],
      sortOrder: 2
    },
    {
      id: 'skills-tooling',
      title: 'Tooling',
      items: ['Git', 'GitHub', 'Docker', 'Linux', 'Ubuntu', 'GCP'],
      sortOrder: 3
    }
  ];
}

function defaultCertificates() {
  return [];
}

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value_json FROM settings WHERE key = ?').get(key);
  return row ? parseJson(row.value_json, fallback) : fallback;
}

export function setSetting(key, value) {
  const timestamp = nowIso();
  getDb()
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .run(key, stringifyJson(value), timestamp);
}

export function incrementMetric(key, delta = 1) {
  const timestamp = nowIso();
  const db = getDb();

  db.prepare(
    `INSERT INTO metrics (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = metrics.value + excluded.value, updated_at = excluded.updated_at`
  ).run(key, delta, timestamp);

  return db.prepare('SELECT value FROM metrics WHERE key = ?').get(key)?.value ?? 0;
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function hasAnyOwner() {
  return Boolean(getDb().prepare('SELECT 1 FROM owners LIMIT 1').get());
}

export function createOwner({ email, name, password }) {
  const timestamp = nowIso();
  const id = `owner_${nanoid(12)}`;
  const passwordHash = bcrypt.hashSync(password, 12);

  getDb()
    .prepare(
      `INSERT INTO owners (id, email, name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, String(email).trim().toLowerCase(), String(name).trim(), passwordHash, timestamp, timestamp);

  return { id, email: String(email).trim().toLowerCase(), name: String(name).trim() };
}

export function createSession(ownerId, { userAgent = '', ipAddress = '', ttlHours = 24 * 7 } = {}) {
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const id = `session_${nanoid(14)}`;
  const token = nanoid(48);
  const csrfToken = nanoid(24);

  getDb()
    .prepare(
      `INSERT INTO sessions (
         id, owner_id, token_hash, csrf_token, user_agent, ip_address, expires_at, created_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, ownerId, hashToken(token), csrfToken, userAgent, ipAddress, expiresAt, timestamp, timestamp);

  return { id, token, csrfToken, expiresAt };
}

export function getSessionByToken(token) {
  if (!token) {
    return null;
  }

  return (
    getDb()
      .prepare(
        `SELECT
           sessions.id,
           sessions.owner_id,
           sessions.csrf_token,
           sessions.expires_at,
           owners.email,
           owners.name
         FROM sessions
         JOIN owners ON owners.id = sessions.owner_id
         WHERE sessions.token_hash = ?`
      )
      .get(hashToken(token)) || null
  );
}

export function touchSession(sessionId) {
  getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), sessionId);
}

export function destroySession(token) {
  if (!token) {
    return;
  }

  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function pruneExpiredSessions() {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

export function logAudit({
  actorOwnerId = null,
  action,
  entityType,
  entityId = null,
  summary,
  metadata = null
}) {
  getDb()
    .prepare(
      `INSERT INTO audit_logs (
         id, actor_owner_id, action, entity_type, entity_id, summary, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      `audit_${nanoid(12)}`,
      actorOwnerId,
      action,
      entityType,
      entityId,
      summary,
      stringifyJson(metadata),
      nowIso()
    );
}

export function registerStoredFile({
  sourcePath = null,
  existingStorageKey = null,
  originalName,
  mimeType,
  sizeBytes = null,
  visibility = 'private',
  sourceKind = 'generic'
}) {
  ensureAppDirs();

  let storageKey = existingStorageKey;

  if (sourcePath) {
    const extension = path.extname(originalName || sourcePath).toLowerCase();
    storageKey = `${Date.now()}-${nanoid(12)}${extension}`;
    fs.copyFileSync(sourcePath, path.join(uploadDir, storageKey));
  }

  if (!storageKey) {
    throw new Error('A source path or storage key is required to register a file.');
  }

  const absolutePath = path.join(uploadDir, storageKey);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Stored file not found for key ${storageKey}.`);
  }

  const stats = fs.statSync(absolutePath);
  const timestamp = nowIso();
  const fileId = `file_${nanoid(12)}`;

  getDb()
    .prepare(
      `INSERT INTO files (
         id, storage_key, original_name, mime_type, size_bytes, visibility, source_kind, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fileId,
      storageKey,
      originalName || path.basename(absolutePath),
      mimeType || mime.lookup(originalName || absolutePath) || 'application/octet-stream',
      Number(sizeBytes ?? stats.size),
      visibility,
      sourceKind,
      timestamp,
      timestamp
    );

  return fileId;
}

export function deleteStoredFile(fileId) {
  const db = getDb();
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

  if (!file) {
    return false;
  }

  const absolutePath = path.join(uploadDir, file.storage_key);
  if (file.storage_key && fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  return true;
}

function ensureSeedAssets(db) {
  const profile = getSetting('site_profile', defaultProfile());
  const contact = getSetting('site_contact', defaultContact());
  let profileChanged = false;
  let contactChanged = false;

  if (!hasStoredFile(profile.profileImageFileId)) {
    if (profile.profileImageFileId) {
      deleteStoredFile(profile.profileImageFileId);
      profile.profileImageFileId = null;
      profileChanged = true;
    }

    const sourcePath = getSeedSource('profileImage');
    if (sourcePath && fs.existsSync(sourcePath)) {
      const fileId = registerStoredFile({
        sourcePath,
        originalName: path.basename(sourcePath),
        mimeType: mime.lookup(sourcePath) || 'image/jpeg',
        visibility: 'public',
        sourceKind: 'profile_image'
      });

      profile.profileImageFileId = fileId;
      profileChanged = true;
    }
  }

  const usableResumeFileId = [profile.resumeFileId, contact.resumeFileId].find((fileId) => hasStoredFile(fileId));

  if (usableResumeFileId) {
    if (profile.resumeFileId !== usableResumeFileId) {
      profile.resumeFileId = usableResumeFileId;
      profileChanged = true;
    }

    if (contact.resumeFileId !== usableResumeFileId) {
      contact.resumeFileId = usableResumeFileId;
      contactChanged = true;
    }
  } else {
    [...new Set([profile.resumeFileId, contact.resumeFileId].filter(Boolean))].forEach((fileId) => {
      deleteStoredFile(fileId);
    });

    if (profile.resumeFileId !== null) {
      profile.resumeFileId = null;
      profileChanged = true;
    }

    if (contact.resumeFileId !== null) {
      contact.resumeFileId = null;
      contactChanged = true;
    }

    const sourcePath = getSeedSource('resume');
    if (sourcePath && fs.existsSync(sourcePath)) {
      const fileId = registerStoredFile({
        sourcePath,
        originalName: path.basename(sourcePath),
        mimeType: mime.lookup(sourcePath) || 'application/pdf',
        visibility: 'public',
        sourceKind: 'resume'
      });

      profile.resumeFileId = fileId;
      contact.resumeFileId = fileId;
      profileChanged = true;
      contactChanged = true;
    }
  }

  if (profileChanged) {
    setSetting('site_profile', profile);
  }

  if (contactChanged) {
    setSetting('site_contact', contact);
  }

  db.prepare('UPDATE files SET visibility = ? WHERE id IN (?, ?)').run(
    'public',
    profile.profileImageFileId,
    profile.resumeFileId
  );
}

function seedDefaults(db) {
  const timestamp = nowIso();

  db.prepare(
    'INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)'
  ).run('site_profile', stringifyJson(defaultProfile()), timestamp);
  db.prepare(
    'INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)'
  ).run('site_contact', stringifyJson(defaultContact()), timestamp);

  db.prepare(
    'INSERT OR IGNORE INTO metrics (key, value, updated_at) VALUES (?, ?, ?)'
  ).run('homepage_views', 0, timestamp);
  db.prepare(
    'INSERT OR IGNORE INTO metrics (key, value, updated_at) VALUES (?, ?, ?)'
  ).run('contact_messages', 0, timestamp);

  if ((db.prepare('SELECT COUNT(*) AS count FROM experiences').get()?.count ?? 0) === 0) {
    const insertExperience = db.prepare(
      `INSERT INTO experiences (
         id, company, role, location, start_date, end_date, is_current, summary, highlights_json, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    defaultExperiences().forEach((experience) => {
      insertExperience.run(
        experience.id,
        experience.company,
        experience.role,
        experience.location,
        experience.startDate,
        experience.endDate,
        experience.isCurrent,
        experience.summary,
        stringifyJson(experience.highlights),
        experience.sortOrder,
        timestamp,
        timestamp
      );
    });
  }

  if ((db.prepare('SELECT COUNT(*) AS count FROM projects').get()?.count ?? 0) === 0) {
    const insertProject = db.prepare(
      `INSERT INTO projects (
         id, slug, title, category, period, summary, description, tech_stack_json, live_url, repo_url, featured, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    defaultProjects().forEach((project) => {
      insertProject.run(
        project.id,
        project.slug,
        project.title,
        project.category,
        project.period,
        project.summary,
        project.description,
        stringifyJson(project.techStack),
        project.liveUrl,
        project.repoUrl,
        project.featured,
        project.sortOrder,
        timestamp,
        timestamp
      );
    });
  }

  if ((db.prepare('SELECT COUNT(*) AS count FROM skill_groups').get()?.count ?? 0) === 0) {
    const insertSkillGroup = db.prepare(
      `INSERT INTO skill_groups (id, title, items_json, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    defaultSkillGroups().forEach((group) => {
      insertSkillGroup.run(group.id, group.title, stringifyJson(group.items), group.sortOrder, timestamp, timestamp);
    });
  }

  if ((db.prepare('SELECT COUNT(*) AS count FROM certificates').get()?.count ?? 0) === 0) {
    const insertCertificate = db.prepare(
      `INSERT INTO certificates (
         id, title, issuer, issue_date, credential_id, credential_url, summary, skills_json, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    defaultCertificates().forEach((certificate) => {
      insertCertificate.run(
        certificate.id,
        certificate.title,
        certificate.issuer,
        certificate.issueDate,
        certificate.credentialId,
        certificate.credentialUrl,
        certificate.summary,
        stringifyJson(certificate.skills),
        certificate.sortOrder,
        timestamp,
        timestamp
      );
    });
  }

  ensureSeedAssets(db);
}

export function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS owners (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_owner_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_owner_id) REFERENCES owners(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metrics (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      storage_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private',
      source_kind TEXT NOT NULL DEFAULT 'generic',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS experiences (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      location TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL,
      highlights_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT,
      period TEXT,
      summary TEXT NOT NULL,
      description TEXT,
      tech_stack_json TEXT NOT NULL DEFAULT '[]',
      live_url TEXT,
      repo_url TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_groups (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      issuer TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      credential_id TEXT,
      credential_url TEXT,
      summary TEXT NOT NULL,
      skills_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      replied_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_experiences_sort ON experiences(sort_order, start_date);
    CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order, featured);
    CREATE INDEX IF NOT EXISTS idx_skill_groups_sort ON skill_groups(sort_order);
    CREATE INDEX IF NOT EXISTS idx_certificates_sort ON certificates(sort_order, issue_date);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON contact_messages(created_at DESC);
  `);

  seedDefaults(db);
  return db;
}

export async function backupDatabase() {
  const db = initDb();
  ensureAppDirs();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupDir, `portfolio-${stamp}.sqlite`);
  const manifestPath = path.join(backupDir, `portfolio-${stamp}.manifest.json`);

  await db.backup(destination);
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        createdAt: nowIso(),
        dbPath,
        destination
      },
      null,
      2
    )
  );

  return { destination, manifestPath };
}
