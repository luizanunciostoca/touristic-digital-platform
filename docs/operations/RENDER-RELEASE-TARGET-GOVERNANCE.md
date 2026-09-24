# Render Release Target Governance

Status: canonical policy for Morro Digital V2 staging and production release targeting.

## Canonical targets

Canonical V2 staging:

- service: `morro-digital-v2-staging`;
- service ID: `srv-da4hb6c9v7es7386ttt0`;
- URL: `https://morro-digital-v2-staging.onrender.com`;
- repository: `luizanunciostoca/touristic-digital-platform`;
- branch: `main`;
- auto deploy: disabled.

Canonical V2 production:

- service: `morro-digital-v2`;
- service ID: `srv-daqgk83ncjis739tghig`;
- URL: `https://morro-digital-v2.onrender.com`;
- repository: `luizanunciostoca/touristic-digital-platform`;
- branch: `main`;
- auto deploy: disabled.

The service `morro-digital-staging` (`srv-d9p0to6gekts73f0lh90`) belongs to the older
`luizidebook/morro-de-sao-paulo-digital` repository and is **LEGACY / DO NOT DEPLOY**
for Morro Digital V2 releases. It must never be referenced from active workflows in this
repository.

## Required GitHub secrets

Staging uses protected staging-scoped deploy hooks:

- `RENDER_STAGING_DEPLOY_HOOK_URL`
- `RENDER_STAGING_IMAGE_DEPLOY_HOOK_URL`

The service ID, service name and canonical URL are non-secret release constants committed
in the workflow. Before a POST is allowed, the workflow parses the protected Render hook,
requires `https://api.render.com/deploy/<service-id>`, and proves that the embedded
service ID equals the canonical staging service ID.

Production remains isolated behind production-scoped values:

- `RENDER_PRODUCTION_API_KEY`
- `RENDER_PRODUCTION_DEPLOY_HOOK_URL`
- `RENDER_PRODUCTION_SERVICE_ID`

Do not introduce generic aliases such as `RENDER_DEPLOY_HOOK_URL`,
`RENDER_SERVICE_ID`, or `RENDER_CANONICAL_URL`.

## Staging proof graph

A staging promotion is valid only when all edges are proved:

`expected SHA -> staging workflow -> canonical service ID/name -> deployment ID -> canonical URL -> live SHA`

The promotion fails closed if the protected deploy hook does not embed the canonical
staging service ID, if the hook does not return a deployment ID, or if the canonical URL
does not serve the requested exact release SHA.

The staging workflow publishes `staging-deployment-evidence.json` containing:

- `expectedSha`
- `serviceId`
- `serviceName`
- `environment`
- `deploymentId`
- `canonicalUrl`
- `liveSha`
- `verifiedAt`
- `workflowRun`

Final Release Acceptance downloads this exact artifact from the staging promotion run and
revalidates all canonical fields before it can succeed.

## Legacy containment

The repository contract test `tooling/quality/release-target-governance.test.mjs` fails if:

- active workflows reference the legacy staging service ID or URL;
- staging references the production V2 service ID or URL;
- staging uses a generic Render deployment secret;
- staging loses its canonical deploy-hook service-ID proof;
- Final Release Acceptance stops consuming structured staging evidence.

The legacy Render service is not deleted by this repository change. Its current Render
configuration must be treated as independent rollback/history infrastructure. If it is no
longer operationally required, disable its auto-deploy in Render administration rather
than deleting the service or its data without a separate retention decision.
