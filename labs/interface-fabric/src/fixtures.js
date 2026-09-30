
export const fixtures = {
  destination:{id:"morro-de-sao-paulo",name:"Morro de São Paulo",weather:{temp:27,condition:"Parcialmente nublado",humidity:78,wind:"14 km/h"}},
  places:[
    {id:"p1",name:"Segunda Praia",category:"Praias",distance:"450 m",rating:4.8,capabilities:["navigate","save","share","assistant"]},
    {id:"p2",name:"Toca do Morcego",category:"Vida Noturna",distance:"1,2 km",rating:4.7,capabilities:["navigate","save","share","ticket","assistant"]},
    {id:"p3",name:"Mirante da Tirolesa",category:"Atrações",distance:"780 m",rating:4.9,capabilities:["navigate","save","share","tour","assistant"]}
  ],
  offers:[
    {id:"o1",name:"Sunset Experience",price:"R$ 120,00",availability:"Disponível hoje",owner:"Commerce"},
    {id:"o2",name:"Passeio Volta à Ilha",price:"R$ 180,00",availability:"3 horários",owner:"Commerce"},
    {id:"o3",name:"Mesa para 2",price:"Reserva sem cobrança",availability:"19:30 / 21:00",owner:"Ordering"}
  ],
  tickets:[{id:"TKT-2026-0412",title:"Sunset Experience",status:"Válido",date:"11 out · 17:00",holder:"Visitante"}],
  affiliate:{id:"AFF-042",name:"Afiliado Demo",status:"Aprovado",attributions:184,qualified:91,conversions:17,earned:"R$ 612,00",pending:"R$ 188,00",level:"Farol",xp:2860,nextLevel:3200,aqs:82,ais:94},
  business:{id:"biz-001",name:"Toca do Morcego",status:"Publicado",views:4210,routes:1370,assistant:612,conversions:218},
  leads:[
    {name:"Pousada Horizonte",contact:"Marina",stage:"Proposta enviada",value:"R$ 1.290"},
    {name:"Restaurante Cais",contact:"João",stage:"Reunião agendada",value:"R$ 890"},
    {name:"Passeios Ilha Viva",contact:"Ana",stage:"Trial",value:"R$ 1.490"}
  ],
  adminRows:[
    {name:"Toca do Morcego",type:"Empresa",status:"Ativo",scope:"Morro de São Paulo"},
    {name:"AFF-042",type:"Afiliado",status:"Aprovado",scope:"Morro de São Paulo"},
    {name:"TKT-2026-0412",type:"Ticket",status:"Válido",scope:"Morro de São Paulo"}
  ],
  growth:{
    level:"Explorador",xp:1280,next:1600,
    missions:[
      {title:"Descubra 3 lugares",progress:2,total:3,reward:"+120 XP",status:"Ativa"},
      {title:"Use o Assistant",progress:1,total:1,reward:"Badge Guia",status:"Concluída"},
      {title:"Inicie uma rota",progress:0,total:1,reward:"+80 XP",status:"Ativa"}
    ],
    badges:["Primeiros Passos","Explorador","Navegador"],
    collections:[{title:"Praias de Morro",progress:"3/5"},{title:"Sabores da Ilha",progress:"2/6"}],
    rewards:[{title:"Acesso prioritário",funding:"Access-based",status:"Elegível"},{title:"Sobremesa parceira",funding:"Merchant-funded",status:"Bloqueado · +320 XP"}],
    experiments:[{name:"Mission card density",variant:"B",status:"Shadow",guardrail:"sem impacto financeiro"}],
    risk:[{subject:"placement H7PQ2K",signal:"velocity",severity:"Média",status:"Revisão"}]
  }
};
