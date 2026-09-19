# Hospedar o Kafé

O frontend precisa de HTTPS para câmera e microfone. O backend coordena as duas cadeiras via WebSocket. Hospedagem estática sozinha, como GitHub Pages, não executa a chamada completa.

## Node ou Docker

1. Instale com `npm ci` e compile com `npm run build`.
2. Execute `npm start`; configure `HOST=0.0.0.0` e a porta esperada pelo provedor em `PORT`.
3. No proxy HTTPS, preserve Origin e habilite Upgrade WebSocket em `/signal`.
4. Configure `KAFE_PUBLIC_ORIGIN` com a origem HTTPS exata do seu site e use `/healthz` como verificação de saúde.
5. Configure TURN e teste a chamada como descrito abaixo.

O Dockerfile fornece a mesma aplicação. Nesse modo, use uma instância: as mesas ficam na memória do processo e reinícios encerram as chamadas. Replicar o processo Node sem compartilhar estado não distribui a mesma mesa.

## Cloudflare Workers

O backend alternativo usa um Durable Object por mesa. `wrangler.jsonc` contém as ligações e a migração inicial. Com Node e o Wrangler oficial instalados e autenticados na sua conta:

```sh
npm ci
npm run build
wrangler deploy
```

Revise o nome do Worker e as condições da sua conta antes de executar. Não há gravação de mídia nem banco de conversas. Dados de conexão são attachments temporários dos WebSockets; alarmes encerram sessões sem heartbeat. A implementação pública em `cloudflare/` é a base do backend hospedado.

## TURN: redes diferentes e restritas

STUN está configurado por padrão. Quando não existe caminho direto entre as redes, é necessário TURN. A presença de uma URL HTTPS não comprova que TURN funciona.

Escolha uma das configurações:

- `KAFE_ICE_SERVERS`: lista JSON com os servidores e as credenciais TURN do seu provedor. Ela será entregue ao navegador; nunca inclua uma chave administrativa nessa lista.
- `KAFE_TURN_URLS` + `KAFE_TURN_SECRET`: endereços separados por vírgula e segredo compartilhado coturn/TURN REST de pelo menos 32 caracteres. O backend entrega credenciais temporárias HMAC-SHA1 ao navegador. `KAFE_TURN_TTL` controla validade (padrão 3600 segundos).

`KAFE_REQUIRE_TURN=true` impede a configuração sem um servidor TURN, mas não testa sua disponibilidade. Configure as variáveis no gerenciador de segredos da hospedagem. Nunca faça commit de `.env` ou de credenciais reais.

O endpoint de configuração é acessível aos visitantes. Ative quotas e alertas de tráfego no provedor TURN e limite acesso/emissão na borda antes de uma divulgação ampla. O projeto oferece acesso por convite, sem autenticação de convidados.

## Aceitação antes de divulgar

Use dois aparelhos, um no Wi-Fi e outro no 4G/5G. Ambos precisam ouvir e ver o outro. Para validar a retransmissão, repita em ambiente de teste com `iceTransportPolicy: 'relay'` e confirme áudio/vídeo recebido. Teste também a terceira pessoa barrada, ritual compartilhado, saída e reconexão. Ao sair ou perder a sessão, os dispositivos devem desligar; ao reconectar, o convite permanece o mesmo.

Celulares podem suspender câmera, áudio ou conexão quando o navegador vai para segundo plano ou a tela é bloqueada. Para o ritual de caminhada, mantenha a página ativa e use áudio; o Kafé não promete chamada em segundo plano.

## Domínio próprio

Primeiro valide a URL fornecida pela hospedagem. Depois conecte um domínio seguindo as instruções desse provedor. Registro.br administra o registro/DNS, e ter um domínio na Hostinger não implica ter um servidor Node/WebSocket. Não substitua registros de e-mail ou de outros sites ao ligar um subdomínio do Kafé.

Referências: [Cloudflare Durable Objects e WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [coturn](https://github.com/coturn/coturn), [WebSocket no Render](https://render.com/docs/websocket).
