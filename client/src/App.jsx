import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

async function apiRequest(url, options = {}) {
  const { body, headers = {}, ...rest } = options;
  const request = {
    credentials: "include",
    ...rest,
    headers: { ...headers },
  };

  if (body !== undefined) {
    if (body instanceof FormData) {
      request.body = body;
    } else {
      request.body = JSON.stringify(body);
      request.headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(url, request);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.error || `Request failed with status ${response.status}.`,
    );
  }

  return payload;
}

function buildMultipartPayload(fields) {
  const formData = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (value instanceof File) {
      formData.append(key, value);
      return;
    }

    if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
      formData.append(key, JSON.stringify(value));
      return;
    }

    formData.append(key, String(value));
  });

  return formData;
}

function splitParagraphs(value) {
  return String(value || "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitList(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSocialLinks(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url] = line.split("|").map((item) => item.trim());
      return { label: label || "", url: url || "" };
    })
    .filter((link) => link.label && link.url);
}

function formatMonth(value) {
  if (!value) {
    return "";
  }

  const [year, month] = String(value).split("-").map(Number);
  if (!year || !month) {
    return value;
  }

  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function formatRange(startDate, endDate, isCurrent) {
  const start = formatMonth(startDate);
  const end = isCurrent || !endDate ? "Present" : formatMonth(endDate);
  return `${start} - ${end}`;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function emptyProfileDraft() {
  return {
    name: "",
    title: "",
    headline: "",
    location: "",
    email: "",
    phone: "",
    summaryText: "",
    focusAreasText: "",
    availabilityNote: "",
    socialLinksText: "",
    profileImageFile: null,
    resumeFile: null,
  };
}

function profileToDraft(profile) {
  return {
    name: profile?.name || "",
    title: profile?.title || "",
    headline: profile?.headline || "",
    location: profile?.location || "",
    email: profile?.email || "",
    phone: profile?.phone || "",
    summaryText: (profile?.summary || []).join("\n\n"),
    focusAreasText: (profile?.focusAreas || []).join(", "),
    availabilityNote: profile?.availabilityNote || "",
    socialLinksText: (profile?.socialLinks || [])
      .map((link) => `${link.label} | ${link.url}`)
      .join("\n"),
    profileImageFile: null,
    resumeFile: null,
  };
}

function emptyContactDraft() {
  return {
    headline: "",
    email: "",
    phone: "",
    location: "",
  };
}

function contactToDraft(contact) {
  return {
    headline: contact?.headline || "",
    email: contact?.email || "",
    phone: contact?.phone || "",
    location: contact?.location || "",
  };
}

function emptyExperienceDraft() {
  return {
    company: "",
    role: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    summary: "",
    highlightsText: "",
    sortOrder: 0,
  };
}

function experienceToDraft(item) {
  return {
    company: item?.company || "",
    role: item?.role || "",
    location: item?.location || "",
    startDate: item?.startDate || "",
    endDate: item?.endDate || "",
    isCurrent: Boolean(item?.isCurrent),
    summary: item?.summary || "",
    highlightsText: (item?.highlights || []).join("\n"),
    sortOrder: item?.sortOrder ?? 0,
  };
}

function emptyProjectDraft() {
  return {
    title: "",
    category: "",
    period: "",
    summary: "",
    description: "",
    techStackText: "",
    liveUrl: "",
    repoUrl: "",
    featured: false,
    sortOrder: 0,
  };
}

function projectToDraft(project) {
  return {
    title: project?.title || "",
    category: project?.category || "",
    period: project?.period || "",
    summary: project?.summary || "",
    description: project?.description || "",
    techStackText: (project?.techStack || []).join(", "),
    liveUrl: project?.liveUrl || "",
    repoUrl: project?.repoUrl || "",
    featured: Boolean(project?.featured),
    sortOrder: project?.sortOrder ?? 0,
  };
}

function emptySkillDraft() {
  return {
    title: "",
    itemsText: "",
    sortOrder: 0,
  };
}

function skillToDraft(group) {
  return {
    title: group?.title || "",
    itemsText: (group?.items || []).join(", "),
    sortOrder: group?.sortOrder ?? 0,
  };
}

function emptyCertificateDraft() {
  return {
    title: "",
    issuer: "",
    issueDate: "",
    credentialId: "",
    credentialUrl: "",
    summary: "",
    skillsText: "",
    sortOrder: 0,
  };
}

function certificateToDraft(certificate) {
  return {
    title: certificate?.title || "",
    issuer: certificate?.issuer || "",
    issueDate: certificate?.issueDate || "",
    credentialId: certificate?.credentialId || "",
    credentialUrl: certificate?.credentialUrl || "",
    summary: certificate?.summary || "",
    skillsText: (certificate?.skills || []).join(", "),
    sortOrder: certificate?.sortOrder ?? 0,
  };
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" type="button" onClick={onToggle}>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

function FormMessage({ state }) {
  if (!state?.text) {
    return null;
  }

  return <div className={`form-message ${state.tone}`}>{state.text}</div>;
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {hint ? <span className="muted-text">{hint}</span> : null}
    </div>
  );
}

function SocialLinks({ links = [] }) {
  if (!links.length) {
    return null;
  }

  return (
    <div className="social-links">
      {links.map((link) => (
        <a
          key={`${link.label}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function SectionTitle({ label, title, body }) {
  return (
    <div className="section-title">
      {label ? <span className="eyebrow">{label}</span> : null}
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

function CertificateCard({ certificate }) {
  return (
    <article className="detail-card">
      <div className="card-meta">
        <span>{certificate.issuer}</span>
        <span>{formatMonth(certificate.issueDate)}</span>
      </div>
      <h3>{certificate.title}</h3>
      <p>{certificate.summary}</p>
      {certificate.credentialId ? (
        <span className="muted-text">
          Credential ID: {certificate.credentialId}
        </span>
      ) : null}
      {certificate.skills?.length ? (
        <div className="chip-row">
          {certificate.skills.map((item) => (
            <span key={item} className="chip subtle">
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {certificate.credentialUrl ? (
        <div className="button-row">
          <a
            className="ghost-button"
            href={certificate.credentialUrl}
            target="_blank"
            rel="noreferrer"
          >
            View credential
          </a>
        </div>
      ) : null}
    </article>
  );
}

function PublicLayout({ profile, contact, theme, setTheme, children }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close nav on route change
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="site-shell">
      <header className={`site-header${navOpen ? " nav-open" : ""}`}>
        <Link className="site-brand" to="/">
          <span className="brand-mark">SC</span>
          <span>
            <strong>{profile?.name || "Sweata Chakraborty"}</strong>
            <small>{profile?.title || "Data Engineer"}</small>
          </span>
        </Link>

        <nav className="site-nav">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/experience">Experience</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/certificates">Certificates</NavLink>
          <NavLink to="/contact">Contact</NavLink>
        </nav>

        <div className="site-actions">
          {contact?.resume?.downloadUrl ? (
            <a className="ghost-button" href={contact.resume.downloadUrl}>
              Resume
            </a>
          ) : null}
          <ThemeToggle
            theme={theme}
            onToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
          />
        </div>

        <button
          className="hamburger"
          type="button"
          aria-label={navOpen ? "Close menu" : "Open menu"}
          onClick={() => setNavOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <main className="page-shell">{children}</main>
    </div>
  );
}

function HomePage({ bootstrap }) {
  const profile = bootstrap?.profile || {};
  const projects = bootstrap?.projects || [];
  const featuredProjects = projects
    .filter((project) => project.featured)
    .slice(0, 2);
  const topExperiences = (bootstrap?.experiences || []).slice(0, 2);
  const skills = bootstrap?.skillGroups || [];
  const certificates = bootstrap?.certificates || [];
  const recentCertificates = certificates.slice(0, 3);
  const summary = profile.summary || [];
  const focusAreas = profile.focusAreas || [];

  return (
    <div className="page-stack">
      <div className="hero-layout">
        <section className="surface-card hero-copy">
          <span className="eyebrow">Portfolio</span>
          <h1>{profile.name || "Sweata Chakraborty"}</h1>
          <p className="hero-role">{profile.title}</p>
          <p className="hero-headline">{profile.headline}</p>

          <div className="stack-md">
            {summary.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="chip-row">
            {focusAreas.map((item) => (
              <span key={item} className="chip">
                {item}
              </span>
            ))}
          </div>

          <div className="button-row">
            <Link className="primary-button" to="/projects">
              View projects
            </Link>
            <Link className="ghost-button" to="/contact">
              Reach out
            </Link>
          </div>
        </section>

        <aside className="surface-card profile-card">
          {profile.profileImage?.url ? (
            <img
              className="profile-photo"
              src={profile.profileImage.url}
              alt={profile.name || "Profile"}
            />
          ) : (
            <div className="profile-placeholder">SC</div>
          )}

          <div className="stack-sm">
            <span className="eyebrow">Based in</span>
            <strong>{profile.location}</strong>
            <p>{profile.availabilityNote}</p>
          </div>

          <div className="info-grid">
            <div>
              <span className="eyebrow">Email</span>
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </div>
            <div>
              <span className="eyebrow">Phone</span>
              <span>{profile.phone}</span>
            </div>
          </div>

          <SocialLinks links={profile.socialLinks} />
        </aside>
      </div>

      <section className="stats-grid">
        <StatCard
          label="Projects"
          value={bootstrap?.projects?.length || 0}
          hint="Portfolio work and builds"
        />
        <StatCard
          label="Experience"
          value={bootstrap?.experiences?.length || 0}
          hint="Roles and internships"
        />
        <StatCard
          label="Certificates"
          value={bootstrap?.certificates?.length || 0}
          hint="Verified credentials and learning"
        />
        <StatCard
          label="Visitors"
          value={bootstrap?.metrics?.homepageViews || 0}
          hint="Homepage visits tracked locally"
        />
      </section>

      <div className="content-grid">
        <section className="surface-card">
          <SectionTitle
            label="Selected work"
            title="Projects grounded in delivery."
            body="A mix of automation, product-facing UI work, and full-stack implementation."
          />
          <div className="card-grid">
            {featuredProjects.length ? (
              featuredProjects.map((project) => (
                <article key={project.id} className="detail-card">
                  <div className="card-meta">
                    <span>{project.category}</span>
                    <span>{project.period}</span>
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.summary}</p>
                  <div className="chip-row">
                    {project.techStack.map((item) => (
                      <span key={item} className="chip subtle">
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title="Projects coming soon"
                description="Use the dashboard to add project entries."
              />
            )}
          </div>
        </section>

        <section className="surface-card">
          <SectionTitle
            label="Recent experience"
            title="Hands-on work across data, cloud, and internal tooling."
            body="Roles that combine execution, collaboration, and practical engineering decisions."
          />
          <div className="stack-md">
            {topExperiences.map((item) => (
              <article key={item.id} className="timeline-card compact">
                <div className="card-meta">
                  <span>
                    {formatRange(item.startDate, item.endDate, item.isCurrent)}
                  </span>
                  <span>{item.location}</span>
                </div>
                <h3>{item.role}</h3>
                <strong>{item.company}</strong>
                <p>{item.summary}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="surface-card">
        <SectionTitle
          label="Certificates"
          title="Credentials that reinforce practical engineering work."
          body="Verified learning and certifications that complement project delivery across data, cloud, and full-stack execution."
        />
        <div className="card-grid">
          {recentCertificates.length ? (
            recentCertificates.map((certificate) => (
              <CertificateCard key={certificate.id} certificate={certificate} />
            ))
          ) : (
            <EmptyState
              title="Certificates will appear here"
              description="Verified certifications and learning milestones will be listed here when available."
            />
          )}
        </div>
        {certificates.length ? (
          <div className="button-row">
            <Link className="ghost-button" to="/certificates">
              Browse certificates
            </Link>
          </div>
        ) : null}
      </section>

      <section className="surface-card">
        <SectionTitle
          label="Core strengths"
          title="Skill groups shaped by real project work."
          body="A practical stack spanning automation, infrastructure, APIs, and frontend implementation."
        />
        <div className="card-grid">
          {skills.map((group) => (
            <article key={group.id} className="detail-card">
              <h3>{group.title}</h3>
              <div className="chip-row">
                {group.items.map((item) => (
                  <span key={item} className="chip subtle">
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExperiencePage({ bootstrap }) {
  const experiences = bootstrap?.experiences || [];

  return (
    <div className="page-stack">
      <section className="surface-card">
        <SectionTitle
          label="Experience"
          title="Roles focused on reliable delivery."
          body="A progression through data engineering, frontend implementation, and enterprise workflow development."
        />

        <div className="timeline-stack">
          {experiences.length ? (
            experiences.map((item) => (
              <article key={item.id} className="timeline-card">
                <div className="card-meta">
                  <span>
                    {formatRange(item.startDate, item.endDate, item.isCurrent)}
                  </span>
                  <span>{item.location}</span>
                </div>
                <h3>{item.role}</h3>
                <strong>{item.company}</strong>
                <p>{item.summary}</p>
                <ul className="detail-list">
                  {item.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </article>
            ))
          ) : (
            <EmptyState
              title="No experience yet"
              description="Add roles from the dashboard to populate this page."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ProjectsPage({ bootstrap }) {
  const projects = bootstrap?.projects || [];

  return (
    <div className="page-stack">
      <section className="surface-card">
        <SectionTitle
          label="Projects"
          title="Work that blends systems thinking with product execution."
          body="From automation to full-stack applications, each project emphasizes reliability, usability, and clear delivery."
        />

        <div className="card-grid projects-grid">
          {projects.length ? (
            projects.map((project) => (
              <article key={project.id} className="detail-card project-card">
                <div className="card-meta">
                  <span>{project.category}</span>
                  <span>{project.period}</span>
                </div>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                {project.description ? (
                  <p className="muted-text">{project.description}</p>
                ) : null}

                <div className="chip-row">
                  {project.techStack.map((item) => (
                    <span key={item} className="chip subtle">
                      {item}
                    </span>
                  ))}
                </div>

                {(project.liveUrl || project.repoUrl) && (
                  <div className="button-row">
                    {project.liveUrl ? (
                      <a
                        className="ghost-button"
                        href={project.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Live
                      </a>
                    ) : null}
                    {project.repoUrl ? (
                      <a
                        className="ghost-button"
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Repository
                      </a>
                    ) : null}
                  </div>
                )}
              </article>
            ))
          ) : (
            <EmptyState
              title="No projects yet"
              description="Use the admin dashboard to add projects."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function CertificatesPage({ bootstrap }) {
  const certificates = bootstrap?.certificates || [];

  return (
    <div className="page-stack">
      <section className="surface-card">
        <SectionTitle
          label="Certificates"
          title="Credentials that support hands-on delivery."
          body="A focused list of certifications and verified learning that complement work in data, cloud, and product engineering."
        />

        <div className="card-grid">
          {certificates.length ? (
            certificates.map((certificate) => (
              <CertificateCard key={certificate.id} certificate={certificate} />
            ))
          ) : (
            <EmptyState
              title="No certificates yet"
              description="Verified certifications and professional learning milestones will appear here."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ContactPage({ bootstrap, onSendMessage }) {
  const contact = bootstrap?.contact || {};
  const profile = bootstrap?.profile || {};
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    try {
      await onSendMessage(form);
      setForm({
        name: "",
        email: "",
        company: "",
        message: "",
      });
      setStatus({ tone: "success", text: "Message sent successfully." });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="content-grid contact-layout">
        <section className="surface-card">
          <SectionTitle
            label="Contact"
            title="Let’s talk about roles, systems, and product work."
            body={contact.headline}
          />

          <div className="stack-md">
            <div className="info-grid">
              <div>
                <span className="eyebrow">Email</span>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </div>
              <div>
                <span className="eyebrow">Phone</span>
                <span>{contact.phone}</span>
              </div>
              <div>
                <span className="eyebrow">Location</span>
                <span>{contact.location}</span>
              </div>
              <div>
                <span className="eyebrow">Resume</span>
                {contact.resume?.downloadUrl ? (
                  <a href={contact.resume.downloadUrl}>Download PDF</a>
                ) : (
                  <span>Unavailable</span>
                )}
              </div>
            </div>

            <SocialLinks links={profile.socialLinks} />
          </div>
        </section>

        <section className="surface-card">
          <SectionTitle
            label="Message"
            title="Start a conversation."
            body="Use the form and the message will land in the private dashboard."
          />

          <form className="stack-md" onSubmit={handleSubmit}>
            <FormMessage state={status} />

            <div className="field-grid">
              <label>
                <span>Name</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  required
                />
              </label>
            </div>

            <label>
              <span>Company or context</span>
              <input
                value={form.company}
                onChange={(event) =>
                  setForm({ ...form, company: event.target.value })
                }
              />
            </label>

            <label>
              <span>Message</span>
              <textarea
                rows="8"
                value={form.message}
                onChange={(event) =>
                  setForm({ ...form, message: event.target.value })
                }
                required
              />
            </label>

            <div className="button-row">
              <button
                className="primary-button"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Sending..." : "Send message"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function LoginPage({ session, onAuthenticate }) {
  const [mode, setMode] = useState(session.setupRequired ? "setup" : "login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    setupKey: "",
  });
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(session.setupRequired ? "setup" : "login");
  }, [session.setupRequired]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    try {
      if (mode === "setup") {
        await onAuthenticate("/api/auth/setup", form);
      } else {
        await onAuthenticate("/api/auth/login", {
          email: form.email,
          password: form.password,
        });
      }
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (session.authenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="auth-shell">
      <section className="surface-card auth-card">
        <SectionTitle
          label="Private access"
          title={
            mode === "setup"
              ? "Create the owner account."
              : "Sign into the portfolio dashboard."
          }
          body={
            mode === "setup"
              ? "This setup form is available only until the first owner is created."
              : "Admin access is intentionally kept off the public navigation."
          }
        />

        <form className="stack-md" onSubmit={handleSubmit}>
          <FormMessage state={status} />

          {mode === "setup" ? (
            <label>
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />
            </label>
          ) : null}

          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              required
            />
          </label>

          {mode === "setup" ? (
            <label>
              <span>Setup key</span>
              <input
                value={form.setupKey}
                onChange={(event) =>
                  setForm({ ...form, setupKey: event.target.value })
                }
              />
            </label>
          ) : null}

          <div className="button-row">
            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Please wait..."
                : mode === "setup"
                  ? "Create owner"
                  : "Login"}
            </button>
            {!session.setupRequired ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setStatus(null);
                  setMode(mode === "login" ? "setup" : "login");
                }}
              >
                {mode === "login" ? "Use setup form" : "Back to login"}
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function DashboardPage({ session, dashboard, onLogout, refreshDashboard }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!session.authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!dashboard) {
    return <div className="page-loading">Loading dashboard...</div>;
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "profile", label: "Profile" },
    { id: "experience", label: "Experience" },
    { id: "projects", label: "Projects" },
    { id: "certificates", label: "Certificates" },
    { id: "skills", label: "Skills" },
    { id: "messages", label: "Messages" },
  ];

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <span className="eyebrow">Dashboard</span>
          <strong>{session.owner?.name}</strong>
          <small>{session.owner?.email}</small>
        </div>

        <div className="stack-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`sidebar-button ${activeTab === tab.id ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          className="ghost-button full-width"
          type="button"
          onClick={onLogout}
        >
          Logout
        </button>
      </aside>

      <div className="dashboard-main">
        {activeTab === "overview" ? (
          <OverviewTab dashboard={dashboard} />
        ) : null}
        {activeTab === "profile" ? (
          <ProfileTab
            dashboard={dashboard}
            csrfToken={session.csrfToken}
            refreshDashboard={refreshDashboard}
          />
        ) : null}
        {activeTab === "experience" ? (
          <ExperienceTab
            experiences={dashboard.experiences}
            csrfToken={session.csrfToken}
            refreshDashboard={refreshDashboard}
          />
        ) : null}
        {activeTab === "projects" ? (
          <ProjectsTab
            projects={dashboard.projects}
            csrfToken={session.csrfToken}
            refreshDashboard={refreshDashboard}
          />
        ) : null}
        {activeTab === "certificates" ? (
          <CertificatesTab
            certificates={dashboard.certificates}
            csrfToken={session.csrfToken}
            refreshDashboard={refreshDashboard}
          />
        ) : null}
        {activeTab === "skills" ? (
          <SkillsTab
            skillGroups={dashboard.skillGroups}
            csrfToken={session.csrfToken}
            refreshDashboard={refreshDashboard}
          />
        ) : null}
        {activeTab === "messages" ? (
          <MessagesTab
            messages={dashboard.messages}
            csrfToken={session.csrfToken}
            refreshDashboard={refreshDashboard}
          />
        ) : null}
      </div>
    </div>
  );
}

function OverviewTab({ dashboard }) {
  return (
    <div className="page-stack">
      <section className="surface-card">
        <SectionTitle
          label="Overview"
          title="A concise control room for the portfolio."
          body="Track page interest, incoming messages, and the shape of the portfolio content."
        />

        <div className="stats-grid">
          <StatCard
            label="Homepage views"
            value={dashboard.metrics.homepageViews}
            hint="Incremented on home visits"
          />
          <StatCard
            label="Messages"
            value={dashboard.overview.counts.messages}
            hint={`${dashboard.overview.counts.unreadMessages} unread`}
          />
          <StatCard
            label="Projects"
            value={dashboard.overview.counts.projects}
            hint="Published portfolio pieces"
          />
          <StatCard
            label="Experience"
            value={dashboard.overview.counts.experiences}
            hint="Timeline entries"
          />
          <StatCard
            label="Certificates"
            value={dashboard.overview.counts.certificates}
            hint="Credential entries"
          />
        </div>
      </section>

      <div className="content-grid">
        <section className="surface-card">
          <SectionTitle label="Recent messages" title="Latest incoming notes" />
          <div className="stack-md">
            {dashboard.messages.slice(0, 4).map((message) => (
              <article key={message.id} className="detail-card">
                <div className="card-meta">
                  <span>{message.name}</span>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                <strong>{message.email}</strong>
                <p>{message.message}</p>
              </article>
            ))}
            {!dashboard.messages.length ? (
              <EmptyState
                title="No messages yet"
                description="Contact submissions will appear here."
              />
            ) : null}
          </div>
        </section>

        <section className="surface-card">
          <SectionTitle label="Recent activity" title="Audit log" />
          <div className="stack-sm">
            {dashboard.auditLogs.map((item) => (
              <div key={item.id} className="inline-note">
                <strong>{item.summary}</strong>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProfileTab({ dashboard, csrfToken, refreshDashboard }) {
  const [profileDraft, setProfileDraft] = useState(emptyProfileDraft());
  const [contactDraft, setContactDraft] = useState(emptyContactDraft());
  const [profileStatus, setProfileStatus] = useState(null);
  const [contactStatus, setContactStatus] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    setProfileDraft(profileToDraft(dashboard.profile));
    setContactDraft(contactToDraft(dashboard.contact));
  }, [dashboard.profile, dashboard.contact]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileStatus(null);

    try {
      await apiRequest("/api/admin/profile", {
        method: "PUT",
        headers: {
          "x-csrf-token": csrfToken,
        },
        body: buildMultipartPayload({
          name: profileDraft.name,
          title: profileDraft.title,
          headline: profileDraft.headline,
          location: profileDraft.location,
          email: profileDraft.email,
          phone: profileDraft.phone,
          summary: splitParagraphs(profileDraft.summaryText),
          focusAreas: splitList(profileDraft.focusAreasText),
          availabilityNote: profileDraft.availabilityNote,
          socialLinks: parseSocialLinks(profileDraft.socialLinksText),
          profileImage: profileDraft.profileImageFile,
          resume: profileDraft.resumeFile,
        }),
      });

      await refreshDashboard();
      setProfileStatus({ tone: "success", text: "Profile updated." });
      setProfileDraft((current) => ({
        ...current,
        profileImageFile: null,
        resumeFile: null,
      }));
    } catch (error) {
      setProfileStatus({ tone: "error", text: error.message });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    setSavingContact(true);
    setContactStatus(null);

    try {
      await apiRequest("/api/admin/contact", {
        method: "PUT",
        headers: {
          "x-csrf-token": csrfToken,
        },
        body: contactDraft,
      });

      await refreshDashboard();
      setContactStatus({ tone: "success", text: "Contact details updated." });
    } catch (error) {
      setContactStatus({ tone: "error", text: error.message });
    } finally {
      setSavingContact(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="surface-card">
        <SectionTitle
          label="Profile"
          title="Update the main public story."
          body="This section controls the hero area, social links, profile image, and resume."
        />

        <form className="stack-md" onSubmit={handleProfileSubmit}>
          <FormMessage state={profileStatus} />

          <div className="field-grid">
            <label>
              <span>Name</span>
              <input
                value={profileDraft.name}
                onChange={(event) =>
                  setProfileDraft({ ...profileDraft, name: event.target.value })
                }
              />
            </label>
            <label>
              <span>Title</span>
              <input
                value={profileDraft.title}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    title: event.target.value,
                  })
                }
              />
            </label>
          </div>

          <label>
            <span>Headline</span>
            <input
              value={profileDraft.headline}
              onChange={(event) =>
                setProfileDraft({
                  ...profileDraft,
                  headline: event.target.value,
                })
              }
            />
          </label>

          <div className="field-grid">
            <label>
              <span>Location</span>
              <input
                value={profileDraft.location}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    location: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                value={profileDraft.phone}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    phone: event.target.value,
                  })
                }
              />
            </label>
          </div>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={profileDraft.email}
              onChange={(event) =>
                setProfileDraft({ ...profileDraft, email: event.target.value })
              }
            />
          </label>

          <label>
            <span>Summary paragraphs</span>
            <textarea
              rows="7"
              value={profileDraft.summaryText}
              onChange={(event) =>
                setProfileDraft({
                  ...profileDraft,
                  summaryText: event.target.value,
                })
              }
            />
          </label>

          <label>
            <span>Focus areas</span>
            <input
              value={profileDraft.focusAreasText}
              onChange={(event) =>
                setProfileDraft({
                  ...profileDraft,
                  focusAreasText: event.target.value,
                })
              }
              placeholder="Data Engineering, Python Automation, AWS"
            />
          </label>

          <label>
            <span>Availability note</span>
            <input
              value={profileDraft.availabilityNote}
              onChange={(event) =>
                setProfileDraft({
                  ...profileDraft,
                  availabilityNote: event.target.value,
                })
              }
            />
          </label>

          <label>
            <span>Social links</span>
            <textarea
              rows="4"
              value={profileDraft.socialLinksText}
              onChange={(event) =>
                setProfileDraft({
                  ...profileDraft,
                  socialLinksText: event.target.value,
                })
              }
              placeholder="LinkedIn | https://linkedin.com/in/example"
            />
          </label>

          <div className="field-grid">
            <label>
              <span>Profile image</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    profileImageFile: event.target.files?.[0] || null,
                  })
                }
              />
              {dashboard.profile.profileImage ? (
                <small>
                  Current: {dashboard.profile.profileImage.originalName}
                </small>
              ) : null}
            </label>
            <label>
              <span>Resume PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    resumeFile: event.target.files?.[0] || null,
                  })
                }
              />
              {dashboard.profile.resume ? (
                <small>Current: {dashboard.profile.resume.originalName}</small>
              ) : null}
            </label>
          </div>

          <div className="button-row">
            <button
              className="primary-button"
              type="submit"
              disabled={savingProfile}
            >
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <section className="surface-card">
        <SectionTitle
          label="Public contact"
          title="Control the dedicated contact page copy."
          body="Keep the outreach message aligned with the kinds of roles or collaborations you want."
        />

        <form className="stack-md" onSubmit={handleContactSubmit}>
          <FormMessage state={contactStatus} />

          <label>
            <span>Contact headline</span>
            <textarea
              rows="3"
              value={contactDraft.headline}
              onChange={(event) =>
                setContactDraft({
                  ...contactDraft,
                  headline: event.target.value,
                })
              }
            />
          </label>

          <div className="field-grid">
            <label>
              <span>Email</span>
              <input
                type="email"
                value={contactDraft.email}
                onChange={(event) =>
                  setContactDraft({
                    ...contactDraft,
                    email: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                value={contactDraft.phone}
                onChange={(event) =>
                  setContactDraft({
                    ...contactDraft,
                    phone: event.target.value,
                  })
                }
              />
            </label>
          </div>

          <label>
            <span>Location</span>
            <input
              value={contactDraft.location}
              onChange={(event) =>
                setContactDraft({
                  ...contactDraft,
                  location: event.target.value,
                })
              }
            />
          </label>

          <div className="button-row">
            <button
              className="primary-button"
              type="submit"
              disabled={savingContact}
            >
              {savingContact ? "Saving..." : "Save contact"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ExperienceTab({ experiences, csrfToken, refreshDashboard }) {
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyExperienceDraft());
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedId === null) {
      setSelectedId(experiences[0]?.id || "new");
    }
  }, [experiences, selectedId]);

  useEffect(() => {
    if (selectedId === "new") {
      setDraft(emptyExperienceDraft());
      return;
    }

    const item = experiences.find((entry) => entry.id === selectedId);
    if (item) {
      setDraft(experienceToDraft(item));
    }
  }, [experiences, selectedId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const payload = {
        ...draft,
        highlights: splitList(draft.highlightsText),
      };

      if (selectedId === "new") {
        await apiRequest("/api/admin/experiences", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
        setSelectedId("new");
        setDraft(emptyExperienceDraft());
      } else {
        await apiRequest(`/api/admin/experiences/${selectedId}`, {
          method: "PUT",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
      }

      await refreshDashboard();
      setStatus({
        tone: "success",
        text:
          selectedId === "new" ? "Experience created." : "Experience updated.",
      });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (selectedId === "new") {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      await apiRequest(`/api/admin/experiences/${selectedId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      setSelectedId(null);
      await refreshDashboard();
      setStatus({ tone: "success", text: "Experience deleted." });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-shell">
      <section className="surface-card editor-list">
        <div className="stack-md">
          <SectionTitle label="Experience" title="Manage the timeline" />
          <button
            className="primary-button"
            type="button"
            onClick={() => setSelectedId("new")}
          >
            New experience
          </button>

          {experiences.map((item) => (
            <button
              key={item.id}
              className={`list-card ${selectedId === item.id ? "active" : ""}`}
              type="button"
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{item.role}</strong>
              <span>{item.company}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card editor-panel">
        <SectionTitle
          label={selectedId === "new" ? "Create" : "Edit"}
          title={
            selectedId === "new"
              ? "Add a new experience entry."
              : "Update the selected experience."
          }
        />

        <form className="stack-md" onSubmit={handleSubmit}>
          <FormMessage state={status} />

          <div className="field-grid">
            <label>
              <span>Company</span>
              <input
                value={draft.company}
                onChange={(event) =>
                  setDraft({ ...draft, company: event.target.value })
                }
              />
            </label>
            <label>
              <span>Role</span>
              <input
                value={draft.role}
                onChange={(event) =>
                  setDraft({ ...draft, role: event.target.value })
                }
              />
            </label>
          </div>

          <div className="field-grid">
            <label>
              <span>Location</span>
              <input
                value={draft.location}
                onChange={(event) =>
                  setDraft({ ...draft, location: event.target.value })
                }
              />
            </label>
            <label>
              <span>Sort order</span>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <div className="field-grid">
            <label>
              <span>Start date</span>
              <input
                type="month"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
              />
            </label>
            <label>
              <span>End date</span>
              <input
                type="month"
                value={draft.endDate}
                onChange={(event) =>
                  setDraft({ ...draft, endDate: event.target.value })
                }
                disabled={draft.isCurrent}
              />
            </label>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.isCurrent}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  isCurrent: event.target.checked,
                  endDate: event.target.checked ? "" : draft.endDate,
                })
              }
            />
            <span>This is the current role</span>
          </label>

          <label>
            <span>Summary</span>
            <textarea
              rows="3"
              value={draft.summary}
              onChange={(event) =>
                setDraft({ ...draft, summary: event.target.value })
              }
            />
          </label>

          <label>
            <span>Highlights</span>
            <textarea
              rows="8"
              value={draft.highlightsText}
              onChange={(event) =>
                setDraft({ ...draft, highlightsText: event.target.value })
              }
              placeholder="One highlight per line"
            />
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : selectedId === "new"
                  ? "Create entry"
                  : "Save changes"}
            </button>
            {selectedId !== "new" ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function ProjectsTab({ projects, csrfToken, refreshDashboard }) {
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyProjectDraft());
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedId === null) {
      setSelectedId(projects[0]?.id || "new");
    }
  }, [projects, selectedId]);

  useEffect(() => {
    if (selectedId === "new") {
      setDraft(emptyProjectDraft());
      return;
    }

    const item = projects.find((project) => project.id === selectedId);
    if (item) {
      setDraft(projectToDraft(item));
    }
  }, [projects, selectedId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const payload = {
        ...draft,
        techStack: splitList(draft.techStackText),
      };

      if (selectedId === "new") {
        await apiRequest("/api/admin/projects", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
        setSelectedId("new");
        setDraft(emptyProjectDraft());
      } else {
        await apiRequest(`/api/admin/projects/${selectedId}`, {
          method: "PUT",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
      }

      await refreshDashboard();
      setStatus({
        tone: "success",
        text: selectedId === "new" ? "Project created." : "Project updated.",
      });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (selectedId === "new") {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      await apiRequest(`/api/admin/projects/${selectedId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      setSelectedId(null);
      await refreshDashboard();
      setStatus({ tone: "success", text: "Project deleted." });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-shell">
      <section className="surface-card editor-list">
        <div className="stack-md">
          <SectionTitle label="Projects" title="Manage portfolio pieces" />
          <button
            className="primary-button"
            type="button"
            onClick={() => setSelectedId("new")}
          >
            New project
          </button>

          {projects.map((project) => (
            <button
              key={project.id}
              className={`list-card ${selectedId === project.id ? "active" : ""}`}
              type="button"
              onClick={() => setSelectedId(project.id)}
            >
              <strong>{project.title}</strong>
              <span>{project.category}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card editor-panel">
        <SectionTitle
          label={selectedId === "new" ? "Create" : "Edit"}
          title={
            selectedId === "new"
              ? "Add a new project."
              : "Update the selected project."
          }
        />

        <form className="stack-md" onSubmit={handleSubmit}>
          <FormMessage state={status} />

          <div className="field-grid">
            <label>
              <span>Title</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label>
              <span>Category</span>
              <input
                value={draft.category}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value })
                }
              />
            </label>
          </div>

          <div className="field-grid">
            <label>
              <span>Period</span>
              <input
                value={draft.period}
                onChange={(event) =>
                  setDraft({ ...draft, period: event.target.value })
                }
              />
            </label>
            <label>
              <span>Sort order</span>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <label>
            <span>Summary</span>
            <textarea
              rows="3"
              value={draft.summary}
              onChange={(event) =>
                setDraft({ ...draft, summary: event.target.value })
              }
            />
          </label>

          <label>
            <span>Description</span>
            <textarea
              rows="7"
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>

          <label>
            <span>Tech stack</span>
            <input
              value={draft.techStackText}
              onChange={(event) =>
                setDraft({ ...draft, techStackText: event.target.value })
              }
              placeholder="React, Appwrite, Tailwind CSS"
            />
          </label>

          <div className="field-grid">
            <label>
              <span>Live URL</span>
              <input
                value={draft.liveUrl}
                onChange={(event) =>
                  setDraft({ ...draft, liveUrl: event.target.value })
                }
              />
            </label>
            <label>
              <span>Repository URL</span>
              <input
                value={draft.repoUrl}
                onChange={(event) =>
                  setDraft({ ...draft, repoUrl: event.target.value })
                }
              />
            </label>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(event) =>
                setDraft({ ...draft, featured: event.target.checked })
              }
            />
            <span>Feature this project on the homepage</span>
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : selectedId === "new"
                  ? "Create project"
                  : "Save changes"}
            </button>
            {selectedId !== "new" ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function CertificatesTab({ certificates, csrfToken, refreshDashboard }) {
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyCertificateDraft());
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedId === null) {
      setSelectedId(certificates[0]?.id || "new");
    }
  }, [certificates, selectedId]);

  useEffect(() => {
    if (selectedId === "new") {
      setDraft(emptyCertificateDraft());
      return;
    }

    const item = certificates.find(
      (certificate) => certificate.id === selectedId,
    );
    if (item) {
      setDraft(certificateToDraft(item));
    }
  }, [certificates, selectedId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const payload = {
        ...draft,
        skills: splitList(draft.skillsText),
      };

      if (selectedId === "new") {
        await apiRequest("/api/admin/certificates", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
        setSelectedId("new");
        setDraft(emptyCertificateDraft());
      } else {
        await apiRequest(`/api/admin/certificates/${selectedId}`, {
          method: "PUT",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
      }

      await refreshDashboard();
      setStatus({
        tone: "success",
        text:
          selectedId === "new"
            ? "Certificate created."
            : "Certificate updated.",
      });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (selectedId === "new") {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      await apiRequest(`/api/admin/certificates/${selectedId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      setSelectedId(null);
      await refreshDashboard();
      setStatus({ tone: "success", text: "Certificate deleted." });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-shell">
      <section className="surface-card editor-list">
        <div className="stack-md">
          <SectionTitle
            label="Certificates"
            title="Manage credentials and learning milestones"
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => setSelectedId("new")}
          >
            New certificate
          </button>

          {certificates.map((certificate) => (
            <button
              key={certificate.id}
              className={`list-card ${selectedId === certificate.id ? "active" : ""}`}
              type="button"
              onClick={() => setSelectedId(certificate.id)}
            >
              <strong>{certificate.title}</strong>
              <span>{certificate.issuer}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card editor-panel">
        <SectionTitle
          label={selectedId === "new" ? "Create" : "Edit"}
          title={
            selectedId === "new"
              ? "Add a new certificate."
              : "Update the selected certificate."
          }
        />

        <form className="stack-md" onSubmit={handleSubmit}>
          <FormMessage state={status} />

          <div className="field-grid">
            <label>
              <span>Title</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label>
              <span>Issuer</span>
              <input
                value={draft.issuer}
                onChange={(event) =>
                  setDraft({ ...draft, issuer: event.target.value })
                }
              />
            </label>
          </div>

          <div className="field-grid">
            <label>
              <span>Issue date</span>
              <input
                type="month"
                value={draft.issueDate}
                onChange={(event) =>
                  setDraft({ ...draft, issueDate: event.target.value })
                }
              />
            </label>
            <label>
              <span>Sort order</span>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <div className="field-grid">
            <label>
              <span>Credential ID</span>
              <input
                value={draft.credentialId}
                onChange={(event) =>
                  setDraft({ ...draft, credentialId: event.target.value })
                }
                placeholder="Optional"
              />
            </label>
            <label>
              <span>Credential URL</span>
              <input
                value={draft.credentialUrl}
                onChange={(event) =>
                  setDraft({ ...draft, credentialUrl: event.target.value })
                }
                placeholder="https://example.com/certificate"
              />
            </label>
          </div>

          <label>
            <span>Summary</span>
            <textarea
              rows="4"
              value={draft.summary}
              onChange={(event) =>
                setDraft({ ...draft, summary: event.target.value })
              }
            />
          </label>

          <label>
            <span>Skills or topics</span>
            <textarea
              rows="4"
              value={draft.skillsText}
              onChange={(event) =>
                setDraft({ ...draft, skillsText: event.target.value })
              }
              placeholder="AWS, Data Engineering, SQL"
            />
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : selectedId === "new"
                  ? "Create certificate"
                  : "Save changes"}
            </button>
            {selectedId !== "new" ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function SkillsTab({ skillGroups, csrfToken, refreshDashboard }) {
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptySkillDraft());
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedId === null) {
      setSelectedId(skillGroups[0]?.id || "new");
    }
  }, [skillGroups, selectedId]);

  useEffect(() => {
    if (selectedId === "new") {
      setDraft(emptySkillDraft());
      return;
    }

    const item = skillGroups.find((group) => group.id === selectedId);
    if (item) {
      setDraft(skillToDraft(item));
    }
  }, [skillGroups, selectedId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const payload = {
        ...draft,
        items: splitList(draft.itemsText),
      };

      if (selectedId === "new") {
        await apiRequest("/api/admin/skill-groups", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
        setSelectedId("new");
        setDraft(emptySkillDraft());
      } else {
        await apiRequest(`/api/admin/skill-groups/${selectedId}`, {
          method: "PUT",
          headers: { "x-csrf-token": csrfToken },
          body: payload,
        });
      }

      await refreshDashboard();
      setStatus({
        tone: "success",
        text:
          selectedId === "new"
            ? "Skill group created."
            : "Skill group updated.",
      });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (selectedId === "new") {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      await apiRequest(`/api/admin/skill-groups/${selectedId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      setSelectedId(null);
      await refreshDashboard();
      setStatus({ tone: "success", text: "Skill group deleted." });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-shell">
      <section className="surface-card editor-list">
        <div className="stack-md">
          <SectionTitle
            label="Skills"
            title="Organize capabilities into groups"
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => setSelectedId("new")}
          >
            New skill group
          </button>

          {skillGroups.map((group) => (
            <button
              key={group.id}
              className={`list-card ${selectedId === group.id ? "active" : ""}`}
              type="button"
              onClick={() => setSelectedId(group.id)}
            >
              <strong>{group.title}</strong>
              <span>{group.items.length} items</span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card editor-panel">
        <SectionTitle
          label={selectedId === "new" ? "Create" : "Edit"}
          title={
            selectedId === "new"
              ? "Add a new skill group."
              : "Update the selected skill group."
          }
        />

        <form className="stack-md" onSubmit={handleSubmit}>
          <FormMessage state={status} />

          <div className="field-grid">
            <label>
              <span>Title</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label>
              <span>Sort order</span>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <label>
            <span>Items</span>
            <textarea
              rows="6"
              value={draft.itemsText}
              onChange={(event) =>
                setDraft({ ...draft, itemsText: event.target.value })
              }
              placeholder="Python, SQL, AWS"
            />
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : selectedId === "new"
                  ? "Create skill group"
                  : "Save changes"}
            </button>
            {selectedId !== "new" ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function MessagesTab({ messages, csrfToken, refreshDashboard }) {
  const [status, setStatus] = useState(null);
  const [loadingId, setLoadingId] = useState("");

  async function toggleRead(message) {
    setLoadingId(message.id);
    setStatus(null);

    try {
      await apiRequest(`/api/admin/contact-messages/${message.id}`, {
        method: "PATCH",
        headers: { "x-csrf-token": csrfToken },
        body: { isRead: !message.isRead },
      });
      await refreshDashboard();
      setStatus({ tone: "success", text: "Message updated." });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setLoadingId("");
    }
  }

  async function deleteMessage(message) {
    setLoadingId(message.id);
    setStatus(null);

    try {
      await apiRequest(`/api/admin/contact-messages/${message.id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      await refreshDashboard();
      setStatus({ tone: "success", text: "Message deleted." });
    } catch (error) {
      setStatus({ tone: "error", text: error.message });
    } finally {
      setLoadingId("");
    }
  }

  return (
    <div className="page-stack">
      <section className="surface-card">
        <SectionTitle
          label="Messages"
          title="Review incoming contact requests."
          body="Messages submitted from the public contact form stay here until you mark them read or remove them."
        />

        <FormMessage state={status} />

        <div className="stack-md">
          {messages.length ? (
            messages.map((message) => (
              <article key={message.id} className="detail-card">
                <div className="card-meta">
                  <span>{message.name}</span>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                <strong>{message.email}</strong>
                {message.company ? (
                  <span className="muted-text">{message.company}</span>
                ) : null}
                <p>{message.message}</p>
                <div className="button-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => toggleRead(message)}
                    disabled={loadingId === message.id}
                  >
                    {message.isRead ? "Mark unread" : "Mark read"}
                  </button>
                  <button
                    className="ghost-button danger"
                    type="button"
                    onClick={() => deleteMessage(message)}
                    disabled={loadingId === message.id}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              title="Inbox is clear"
              description="Public contact form submissions will appear here."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="auth-shell">
      <section className="surface-card auth-card">
        <SectionTitle
          label="404"
          title="This page could not be found."
          body="The portfolio only exposes a small set of public routes and the private admin area."
        />
        <Link className="primary-button" to="/">
          Back home
        </Link>
      </section>
    </div>
  );
}

function RoutedApp({
  theme,
  setTheme,
  session,
  bootstrap,
  dashboard,
  refreshSession,
  refreshBootstrap,
  refreshDashboard,
  authenticate,
  logout,
}) {
  const location = useLocation();
  useScrollReveal();

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!location.pathname.startsWith("/dashboard")) {
      refreshBootstrap(location.pathname === "/");
    }
  }, [location.pathname, refreshBootstrap]);

  useEffect(() => {
    if (location.pathname.startsWith("/dashboard") && session.authenticated) {
      refreshDashboard();
    }
  }, [location.pathname, session.authenticated, refreshDashboard]);

  const content = useMemo(() => bootstrap || {}, [bootstrap]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicLayout
            profile={content.profile}
            contact={content.contact}
            theme={theme}
            setTheme={setTheme}
          >
            <HomePage bootstrap={content} />
          </PublicLayout>
        }
      />
      <Route
        path="/experience"
        element={
          <PublicLayout
            profile={content.profile}
            contact={content.contact}
            theme={theme}
            setTheme={setTheme}
          >
            <ExperiencePage bootstrap={content} />
          </PublicLayout>
        }
      />
      <Route
        path="/projects"
        element={
          <PublicLayout
            profile={content.profile}
            contact={content.contact}
            theme={theme}
            setTheme={setTheme}
          >
            <ProjectsPage bootstrap={content} />
          </PublicLayout>
        }
      />
      <Route
        path="/certificates"
        element={
          <PublicLayout
            profile={content.profile}
            contact={content.contact}
            theme={theme}
            setTheme={setTheme}
          >
            <CertificatesPage bootstrap={content} />
          </PublicLayout>
        }
      />
      <Route
        path="/contact"
        element={
          <PublicLayout
            profile={content.profile}
            contact={content.contact}
            theme={theme}
            setTheme={setTheme}
          >
            <ContactPage
              bootstrap={content}
              onSendMessage={(form) =>
                apiRequest("/api/public/contact", {
                  method: "POST",
                  body: form,
                })
              }
            />
          </PublicLayout>
        }
      />
      <Route
        path="/login"
        element={
          <PublicLayout
            profile={content.profile}
            contact={content.contact}
            theme={theme}
            setTheme={setTheme}
          >
            <LoginPage session={session} onAuthenticate={authenticate} />
          </PublicLayout>
        }
      />
      <Route
        path="/dashboard"
        element={
          <DashboardPage
            session={session}
            dashboard={dashboard}
            onLogout={logout}
            refreshDashboard={refreshDashboard}
          />
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function useScrollReveal() {
  useEffect(() => {
    const SELECTORS = [
      ".page-stack .section-title",
      ".page-stack .stat-card",
      ".page-stack .detail-card",
      ".page-stack .timeline-card",
      ".page-stack .surface-card",
      ".reveal",
    ].join(",");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" },
    );

    const attach = () => {
      const viewH = window.innerHeight;
      document.querySelectorAll(SELECTORS).forEach((el) => {
        if (
          el.classList.contains("visible") ||
          el.classList.contains("will-reveal")
        )
          return;
        const rect = el.getBoundingClientRect();
        // Only animate elements that start below the visible area
        if (rect.top > viewH * 0.92) {
          // find sibling index for stagger
          const siblings = el.parentElement
            ? Array.from(el.parentElement.children).filter((c) =>
                c.matches(SELECTORS),
              )
            : [];
          const idx = siblings.indexOf(el);
          if (idx > 0) el.setAttribute("data-delay", Math.min(idx, 4));
          el.classList.add("will-reveal");
        } else {
          // Already in view — make sure it's fully visible
          el.classList.remove("will-reveal");
        }
        observer.observe(el);
      });
    };

    const raf = requestAnimationFrame(() => {
      attach();
      const mo = new MutationObserver(() => requestAnimationFrame(attach));
      mo.observe(document.body, { childList: true, subtree: true });
      observer._mo = mo;
    });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      if (observer._mo) observer._mo.disconnect();
    };
  }, []);
}

function CustomCursor() {
  useEffect(() => {
    const dot = document.getElementById("cur-dot");
    const ring = document.getElementById("cur-ring");
    if (!dot || !ring) return;

    let mx = 0,
      my = 0,
      rx = 0,
      ry = 0,
      raf;
    let visible = false;

    const show = () => {
      if (!visible) {
        dot.style.opacity = "1";
        ring.style.opacity = "1";
        visible = true;
      }
    };

    const onMove = (e) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(${mx}px,${my}px)`;
      show();
    };

    const onEnter = (e) => {
      const t = e.currentTarget;
      ring.classList.add("cur-hover");
      if (t.tagName === "A" || t.tagName === "BUTTON")
        ring.classList.add("cur-link");
    };
    const onLeave = () => ring.classList.remove("cur-hover", "cur-link");

    const loop = () => {
      rx += (mx - rx) * 0.11;
      ry += (my - ry) * 0.11;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      raf = requestAnimationFrame(loop);
    };

    const attachHover = () => {
      document.querySelectorAll('a,button,[role="button"]').forEach((el) => {
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mouseleave", onLeave);
      });
    };

    document.addEventListener("mousemove", onMove);
    attachHover();
    const mo = new MutationObserver(attachHover);
    mo.observe(document.body, { childList: true, subtree: true });
    raf = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, []);

  return (
    <>
      <div id="cur-dot" className="cur-dot" />
      <div id="cur-ring" className="cur-ring" />
    </>
  );
}

function IntroLoader({ onDone }) {
  const words = [
    "Senior Software Engineer",
    "DevOps Engineer",
    "Data Engineer",
    "Cloud Architect",
  ];
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState("in"); // 'in' | 'hold' | 'out'
  const [exit, setExit] = useState(false);

  useEffect(() => {
    // Show on every page load/refresh

    // Timing per word: 400ms fade-in + 1000ms hold + 300ms fade-out = ~1700ms
    // 4 words × 1700ms ≈ 6.8s total (+ 700ms exit fade) ≈ 5-6s visible feel
    let t;
    if (phase === "in") {
      t = setTimeout(() => setPhase("hold"), 400);
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("out"), 1000);
    } else if (phase === "out") {
      if (wordIdx < words.length - 1) {
        t = setTimeout(() => {
          setWordIdx((i) => i + 1);
          setPhase("in");
        }, 300);
      } else {
        // All words done — fade out entire screen
        t = setTimeout(() => {
          setExit(true);
          setTimeout(() => {
            onDone();
          }, 700);
        }, 400);
      }
    }
    return () => clearTimeout(t);
  }, [phase, wordIdx]);

  return (
    <div className={`intro-overlay${exit ? " intro-exit" : ""}`}>
      <div className="intro-content">
        <div className="intro-name">Sweata Chakraborty</div>
        <div className="intro-divider" />
        <div className={`intro-word intro-${phase}`}>{words[wordIdx]}</div>
        <div className="intro-cursor" />
      </div>
      <div className="intro-grid" />
    </div>
  );
}

export default function App() {
  const [introComplete, setIntroComplete] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("sweata-portfolio-theme") || "light",
  );
  const [session, setSession] = useState({
    loading: true,
    authenticated: false,
    setupRequired: false,
    csrfToken: "",
    owner: null,
  });
  const [bootstrap, setBootstrap] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("sweata-portfolio-theme", theme);
  }, [theme]);

  const refreshSession = useCallback(async () => {
    const data = await apiRequest("/api/auth/session");
    setSession({
      loading: false,
      authenticated: Boolean(data.authenticated),
      setupRequired: Boolean(data.setupRequired),
      csrfToken: data.csrfToken || "",
      owner: data.owner || null,
    });
    return data;
  }, []);

  const refreshBootstrap = useCallback(async (countView = false) => {
    const data = await apiRequest(
      `/api/public/bootstrap?countView=${countView ? "true" : "false"}`,
    );
    setBootstrap(data);
    return data;
  }, []);

  const refreshDashboard = useCallback(async () => {
    setDashboard(null);

    if (!session.authenticated || !session.csrfToken) {
      return null;
    }

    const data = await apiRequest("/api/admin/dashboard", {
      headers: {
        "x-csrf-token": session.csrfToken,
      },
    });

    setDashboard(data);
    return data;
  }, [session.authenticated, session.csrfToken]);

  const authenticate = useCallback(async (endpoint, payload) => {
    const data = await apiRequest(endpoint, {
      method: "POST",
      body: payload,
    });

    setSession({
      loading: false,
      authenticated: true,
      setupRequired: false,
      csrfToken: data.csrfToken,
      owner: data.owner,
    });

    return data;
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setSession({
      loading: false,
      authenticated: false,
      setupRequired: false,
      csrfToken: "",
      owner: null,
    });
    setDashboard(null);
  }, []);

  return (
    <>
      <CustomCursor />
      {!introComplete && <IntroLoader onDone={() => setIntroComplete(true)} />}
      <BrowserRouter>
        <RoutedApp
          theme={theme}
          setTheme={setTheme}
          session={session}
          bootstrap={bootstrap}
          dashboard={dashboard}
          refreshSession={refreshSession}
          refreshBootstrap={refreshBootstrap}
          refreshDashboard={refreshDashboard}
          authenticate={authenticate}
          logout={logout}
        />
      </BrowserRouter>
    </>
  );
}

