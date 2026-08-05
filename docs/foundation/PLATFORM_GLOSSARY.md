# Platform Glossary

## Termos oficiais

### Destination
Unidade turística, geográfica, operacional e de marca. Exemplo: Morro Digital.

### Tenant
Empresa, organização ou operador que atua dentro de um Destination.

### Business
Entidade comercial cadastrada na plataforma. É o termo oficial para pousada, restaurante, agência, operador, loja ou prestador.

### Customer
Pessoa que utiliza a plataforma para descobrir, reservar, comprar ou consumir serviços.

### Tourist
Perfil contextual de Customer em jornada turística. Não substitui o termo técnico `Customer`.

### User
Identidade autenticada que pode representar Customer, colaborador de Business, afiliado ou operador administrativo.

### Platform Admin
Aplicação e papel administrativo global da plataforma.

### Business Portal
Aplicação B2B usada por Business e seus colaboradores.

### Marketplace
Aplicação B2C voltada ao Customer.

### Catalog
Conjunto de ofertas publicáveis, categorias, atributos e disponibilidade comercial.

### Product
Item vendável com preço, disponibilidade e regras de compra.

### Service
Oferta executada ou prestada, possivelmente com agenda, área de atendimento ou capacidade.

### Experience
Oferta turística orientada à vivência, como passeio, atividade, evento ou roteiro.

### Order
Intenção comercial consolidada contendo itens, valores, comprador e estado transacional.

### Booking
Processo e registro de reserva de capacidade, horário, recurso ou serviço.

### Reservation
Instância confirmada ou pendente resultante do Booking Engine.

### Ticket
Credencial de acesso ou validação emitida para evento, atração, transporte ou experiência.

### Payment
Tentativa ou confirmação de transferência financeira associada a uma obrigação.

### Ledger
Registro contábil imutável e balanceado de movimentações financeiras.

### Wallet
Visão de posição financeira derivada do Ledger para uma parte específica.

### Balance
Valor calculado a partir de lançamentos; nunca é a fonte financeira primária isolada.

### Settlement
Processo de liquidação e consolidação financeira entre plataforma, provedor e recebedores.

### Payout
Transferência de valores disponíveis para um recebedor externo.

### Commission
Valor devido por regra comercial, afiliada ou operacional.

### Affiliate
Participante da rede de aquisição da plataforma que pode atribuir Customers e receber comissão.

### Attribution
Vínculo entre Affiliate, Customer, campanha e regra de validade.

### Campaign
Configuração temporal e comercial de aquisição, promoção ou remuneração.

### DestinationContext
Contexto obrigatório que identifica Destination, Tenant opcional, locale, timezone, moeda, correlação e identidade.

### DestinationBoundary
Polígono ou multipolígono oficial que define a área geográfica de um Destination.

### ServiceArea
Geometria que representa a área real de atendimento de um Business ou Service.

### Geofence
Regra geoespacial usada para classificar pertencimento, proximidade ou restrição.

### Adapter
Implementação técnica de uma porta de domínio para banco, mensageria, pagamento, mapas ou outro provedor.

### Port
Contrato definido pelo domínio para uma capacidade externa.

### Module
Bounded context ou unidade de domínio com API pública explícita.

### Package
Biblioteca reutilizável sem responsabilidade de deploy independente.

### App
Aplicação implantável com interface de entrada própria.

### Worker
Processo implantável responsável por tarefas assíncronas ou agendadas.

### Event
Fato imutável ocorrido no domínio ou integração.

### Command
Solicitação explícita de mudança de estado.

### Query
Solicitação de leitura sem alteração de estado.

### Workflow
Sequência coordenada de estados, regras, tarefas e transições.

### Plugin
Extensão opcional e configurável que implementa contratos estáveis da plataforma.

### Feature Flag
Controle de ativação de funcionalidade por ambiente, Destination, Tenant ou público.

### Correlation ID
Identificador usado para rastrear uma jornada entre serviços, eventos e integrações.

### Idempotency Key
Chave que impede efeitos duplicados na repetição de um comando.

## Termos evitados

- `Company`, `Merchant`, `Enterprise`, `Establishment`: usar `Business`.
- `City` como conceito central: usar `Destination`.
- `Account` para posição financeira: usar `Wallet` ou `Ledger Account`, conforme contexto.
- `NewBusiness`, `BusinessOK`: usar eventos no passado conforme Event Naming Bible.

## Regra

Documentos, contratos, código, interfaces e comunicação técnica devem usar estes termos. Sinônimos só são permitidos em conteúdo editorial voltado ao público.
