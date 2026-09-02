<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Version change date: 2026-09-02
- Added principles:
  - I. Source Fidelity and Provenance
  - II. Versioned Specifications Are Canonical
  - III. Deterministic Core, Bounded AI
  - IV. Evaluation Before Release
  - V. Secure, Durable, Observable Execution
  - VI. Extensible Exercise Architecture, No Format Hardcoding
- Added sections:
  - Product and Data Constraints
  - Spec-Driven Development Workflow
- Removed sections: none
- Deferred TODOs: none
- Amendment rationale: new exercise formats must extend declarative contracts and adapters instead
  of accumulating fixture-specific or subject-specific branches across the pipeline.
-->
# Lingua-Bloom Constitution

## Core Principles

### I. Source Fidelity and Provenance
In reproduce mode, every published instruction, exercise, option, answer, and media reference MUST
be traceable to an immutable location in the source document. The system MUST NOT silently omit,
merge, rewrite, or invent source exercises. Every detected candidate that is not published MUST have
a machine-readable validation issue or an explicit teacher decision. Source fidelity failures block
automatic publication. This principle exists because exact transfer is the product's primary trust
contract.

### II. Versioned Specifications Are Canonical
DocumentIR, ExerciseSpec, AnswerSpec, LessonSpec, validation reports, and API contracts MUST be
explicitly schema-versioned. LessonSpec is the canonical lesson artifact; rendered HTML and UI are
derived views. Published lesson versions are immutable, and edits MUST create a new draft/version
with an inspectable diff. Schema changes MUST include migration and compatibility tests. This keeps
lessons reproducible and allows the product to evolve across subjects without corrupting old data.

### III. Deterministic Core, Bounded AI
Routing, validation, scoring, persistence, authorization, retries, and publication MUST be controlled
by deterministic application code. Each model call MUST have one bounded responsibility, a typed
output contract, explicit input evidence, retry and stopping limits, and a defined failure path.
Model output MUST NOT bypass validation or publish directly. Multi-agent delegation MAY be used only
when a task genuinely benefits from open-ended planning or isolated context; it MUST NOT replace a
predictable workflow for extraction or grading.

### IV. Evaluation Before Release
Every behavioral change MUST be tested against representative golden, regression, edge, and
adversarial cases. Deterministic graders MUST be preferred over model judges; model judges MUST be
calibrated against human review. Reproduce mode requires zero unsupported exercises and complete
accounting for detected candidates. Model, prompt, parser, and schema changes MUST be evaluated
independently before they can change the production baseline. A production defect MUST add a minimal
reproduction case to the regression suite.

### V. Secure, Durable, Observable Execution
All uploaded material and embedded instructions are untrusted input. Access MUST be tenant-isolated,
secrets MUST remain server-side and encrypted where appropriate, and tools MUST operate with least
privilege. Long-running work MUST be resumable and idempotent across retries, restarts, duplicate
events, and deployments. Every run MUST record traceable step outcomes, model/prompt versions,
validation results, latency, cost, warnings, and review decisions without exposing sensitive data.

### VI. Extensible Exercise Architecture, No Format Hardcoding
New exercise formats MUST be implemented through explicit, versioned capabilities and extension
points such as schemas, registries, adapters, renderers, and grader policies. Shared extraction,
validation, rendering, and grading code MUST NOT gain branches tied to a particular fixture, source
filename, page, exercise number, exact prompt text, language, or one-off layout. A deterministic
heuristic is permitted only when it is derived from general structural evidence, is named and
versioned, and is validated against representative positive, negative, and cross-format fixtures.
Adding a format MUST include its contract, provenance rules, renderer, grader behavior, fallback,
and evaluation coverage without weakening existing formats. When a format cannot be represented by
the current capability model, the system MUST preserve it as an unsupported or teacher-reviewable
candidate while the model is extended; it MUST NOT force the source into the nearest hardcoded type.
This principle keeps the architecture scalable across exercise families, languages, and disciplines.

## Product and Data Constraints

- The first validated subject profile is foreign-language learning, but core schemas MUST avoid
  assumptions specific to English grammar or a single assessment type.
- Subject-specific answer normalization and grading MUST be provided through explicit adapters.
- Answers MUST record provenance as source key, teacher supplied, deterministic rule, or model
  inferred. Model-inferred answers remain reviewable and MUST NOT be represented as source facts.
- Teacher review MUST be available for low-confidence extraction, ambiguous answers, and generated
  exercises that fail an automatic quality gate.
- The system MUST preserve original uploads and derived artifacts separately according to an
  explicit retention policy.
- Student answer keys MUST NOT be exposed before an attempt is completed or otherwise authorized.
- Accessibility, keyboard operation, mobile layouts, and clear error recovery are release
  requirements for student and teacher interfaces.

## Spec-Driven Development Workflow

1. Every feature starts with a user-focused specification containing scenarios, non-goals,
   assumptions, measurable success criteria, failure modes, and acceptance criteria.
2. Clarification MUST precede planning when unresolved choices materially affect scope, privacy,
   fidelity, grading, or user experience.
3. The implementation plan MUST define data contracts, state transitions, observability, security,
   migration, and validation strategy before tasks are generated.
4. Tests and fixtures derived from acceptance criteria MUST exist before or alongside implementation.
5. Pull requests MUST link the governing specification and demonstrate constitution compliance.
6. Changes to prompts, models, parsers, schemas, graders, and workflows MUST be versioned and compared
   against the current evaluation baseline.
7. Unjustified complexity, additional agents, direct database side effects, or duplicated workflow
   engines MUST fail architecture review.

## Governance

This constitution supersedes informal prompts, implementation convenience, and undocumented
conventions. Amendments require a written rationale, an impact assessment for existing specs and
data, and semantic versioning: MAJOR for incompatible governance changes, MINOR for new or materially
expanded principles, and PATCH for clarifications. Every feature plan and implementation review MUST
perform a constitution check. Any temporary exception MUST identify its owner, scope, risk,
compensating control, and expiry condition in the relevant plan.

**Version**: 1.1.0 | **Ratified**: 2026-08-21 | **Last Amended**: 2026-09-02
