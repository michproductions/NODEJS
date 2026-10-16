H2E CRM WHATSAPP — SERVIÇO NODE.JS PARA HOSTINGER

IMPORTANTE: este ZIP contém somente o serviço Node.js. NÃO é o ZIP para instalar no WordPress.
O plugin WordPress é h2e-crm-whatsapp-3.0.0.zip.

CONFIGURAÇÃO SUGERIDA NO HPanel
- Tipo: Web App / Node.js
- Framework: Express.js (se for solicitado)
- Node.js: 22.x (ou 20.x)
- Arquivo de entrada: server.js (se solicitado)
- Comando de início: npm start (se solicitado)
- Dependências: o Hostinger deve instalar as dependências a partir do package.json.

VARIÁVEIS DE AMBIENTE A DEFINIR NO PAINEL (não coloque segredos num repositório público)
- BRIDGE_SECRET: gere uma string longa, exclusiva e aleatória.
- HOST: 0.0.0.0
- WORDPRESS_INBOUND_URL: https://SEU-DOMINIO/wp-json/h2e-crm/v1/bridge-incoming
- AUTH_DIR: caminho gravável e persistente para salvar a sessão pareada.
- PORT: normalmente o painel injeta/define a porta; só defina manualmente se o painel solicitar.

Depois do deploy, confira a URL pública + /health. Ela deve retornar JSON contendo "ok": true.
Configure a URL pública e o mesmo BRIDGE_SECRET em WordPress > CRM WhatsApp > Configurações.
A seguir abra CRM WhatsApp > Conectar WhatsApp e gere o QR Code.

ATENÇÃO SOBRE PERSISTÊNCIA
Antes de parear a conta principal, confirme com a Hostinger que a aplicação permite gravar e preservar arquivos no caminho AUTH_DIR entre reinicializações e novos deploys. Não coloque os arquivos de sessão em diretório publicamente acessível. Se a sessão não persistir, o WhatsApp poderá pedir novo pareamento.

Esta integração usa Baileys, biblioteca não oficial. Pode parar de funcionar ou provocar restrições na conta do WhatsApp; não use para disparos em massa. PHP/JavaScript verificados estaticamente, mas o pareamento ainda precisa ser testado no ambiente real.
