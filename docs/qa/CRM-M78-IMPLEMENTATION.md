# CRM M78 implementation

Implemented:

- framework-independent `CrmProposalHttpTransport`;
- authenticated list/create/getAccepted/send/respond routes;
- shared mutation security through `CrmTransportAuthPort`;
- Node composition through platform Auth;
- MySQL proposal repository and durable audit reuse;
- server-side cryptographic share-token generation;
- focused transport tests.

Pending before promotion: expand the permanent real-MySQL CRM Platform Auth Integration Contract and remove temporary M78 TODO/checkpoint notes.
