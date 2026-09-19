# Kafé

Uma cafeteria virtual para duas pessoas. Um convite à companhia, às ideias e ao estado de flow.

**Kafé é parte da Krow System e uma expressão do Repouso da Asa.** O encontro pode acontecer numa cafeteria, em casa ou numa caminhada: presença sem pressa, espaço para pensar e liberdade para deixar a conversa encontrar seu ritmo.

> “Pense com os pés” — Kaiury, Krow System.

Um passeio com alguém por uma praça, um shopping ou outro lugar: caminhar, conversar e ter ideias em movimento — uma inspiração peripatética.

## Experimentar

**[Abrir o Kafé](https://kafe-krow.higgsfield.app)** — acesso público, sem cadastro.

Prepare a mesa, copie o convite e envie à sua companhia. Cada participante pode escolher **Iniciar videochamada** para ligar câmera e microfone juntos, ou usar os controles individuais. Os dispositivos só são ativados após a sua escolha e a permissão do navegador. O link dá acesso à mesa; compartilhe apenas com a pessoa convidada. Há duas cadeiras por encontro, sem cadastro e sem gravação pelo aplicativo.

A versão pública foi testada com duas sessões e dispositivos de áudio/vídeo simulados. O serviço TURN ainda não está configurado: chamadas podem falhar em redes que impedem conexão direta entre participantes. A hospedagem atual acrescenta seu próprio selo à página.

## Sete jeitos de encontrar

- **Um gole, uma novidade:** contar e acolher o que aconteceu.
- **Perguntas de guardanapo:** um assunto por vez, sem obrigação de responder.
- **Só fazer companhia:** ler, desenhar, trabalhar numa ideia ou ficar em silêncio.
- **Museu da semana:** um objeto abre uma história.
- **Café de outro lugar:** apresentar uma vista ou uma lembrança.
- **Carta para o próximo café:** deixar um assunto para continuar.
- **Pense com os pés:** passear com alguém por uma praça, um shopping ou outro lugar e ter ideias em movimento.

## Rodar no seu computador

Requer Node.js 22.12 ou superior.

```sh
npm ci
npm run build
npm start
```

Abra `http://localhost:4177`. Duas abas permitem um teste local. Esse endereço não funciona no computador de outra pessoa. Para hospedar a chamada, siga [PUBLICAR.md](PUBLICAR.md).

`npm run dev` inicia o desenvolvimento; `npm test` executa os testes. O frontend usa React e Vite. O servidor Node usa WebSocket para sinalização; áudio e vídeo viajam por WebRTC. Há também um backend Cloudflare Durable Objects em `cloudflare/` para hospedagem distribuída.

## Integrar no dia a dia da sua cafeteria

Você pode hospedar sua versão, colocar o endereço ou QR code no cardápio e convidar duas pessoas a preparar uma mesa. Um QR code de entrada deve apontar para a página inicial; cada encontro ganha seu próprio convite. Não reutilize um link de sala como QR code público.

É possível adaptar textos, rituais e identidade visual. Os rituais ficam em `src/data.js`; se adicionar mais, ajuste os limites correspondentes dos servidores Node e Cloudflare. Os climas e perguntas sincronizam entre as duas pessoas; bebida e volume do ambiente são individuais.

## Privacidade e operação

O aplicativo não grava áudio ou vídeo. O link contém um identificador aleatório; qualquer pessoa que o receba pode ocupar uma cadeira livre. Nomes e preferências ficam no estado temporário da conexão. A sinalização WebRTC pode incluir endereços de rede. O provedor de hospedagem e o provedor TURN processam os dados necessários ao transporte e podem manter seus próprios registros técnicos.

Não há promessa de disponibilidade, autenticação de convidados ou moderação. Configure limites de consumo e TURN na sua hospedagem antes de divulgar amplamente. Testes com dispositivos simulados não substituem a verificação com celulares reais e redes distintas.

## Contribuir e reutilizar

Abra uma issue ou envie um pull request. Preserve a simplicidade do encontro, acessibilidade e escolha consciente de câmera/microfone. Nunca envie credenciais, dados de conversas ou imagens de participantes em relatos públicos de erro.

Licença [MIT](LICENSE): você pode usar, adaptar e integrar, inclusive comercialmente, mantendo o aviso de licença e autoria. Dependências conservam suas próprias licenças. O nome Krow System e os créditos não indicam endosso a versões de terceiros.

A imagem da cafeteria foi gerada por IA para este projeto. Os ícones são do Lucide; as fontes DM Sans e DM Serif Display são carregadas pelo Google Fonts, com alternativas locais. Não há fotos de participantes nem exemplos de conversas reais no repositório.
