import React from 'react'

export default function LandingPage({ onStart }) {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <p className="landing-kicker">CS2 Analyzer</p>
        <h1>Analise profissional de demo para subir de nivel no CS2</h1>
        <p>
          Leitura automatica de rounds, insights taticos e comparacao por jogador para transformar
          dado em decisao de jogo.
        </p>
        <div className="landing-actions">
          <button type="button" className="landing-primary-btn" onClick={onStart}>
            Entrar no Analyzer
          </button>
          <button type="button" className="landing-secondary-btn" onClick={onStart}>
            Testar com demo
          </button>
        </div>
      </section>

      <section className="landing-grid">
        <article className="landing-card">
          <h3>Insight de impacto</h3>
          <p>Entry score, tradeability, clutch profile, post-plant e consistencia por metade.</p>
        </article>
        <article className="landing-card">
          <h3>Leitura por jogador e time</h3>
          <p>Aim, duelos, timeline por round, comparativo lado a lado e visao por equipe.</p>
        </article>
        <article className="landing-card">
          <h3>Profundidade tatica</h3>
          <p>Economia, fechamento de round, ultimo vivo, post-plant e comportamento de risco.</p>
        </article>
      </section>

      <section className="landing-section">
        <header>
          <p className="landing-kicker">Como funciona</p>
          <h2>Do upload ao ajuste do seu jogo em minutos</h2>
        </header>
        <div className="landing-steps">
          <article className="landing-step">
            <span>1</span>
            <h3>Suba sua demo</h3>
            <p>Envie o arquivo .dem e deixe o parser montar rounds, timeline e economia.</p>
          </article>
          <article className="landing-step">
            <span>2</span>
            <h3>Analise por contexto</h3>
            <p>Visualize o que importa em aim, entrada, trade, post-plant e impacto real.</p>
          </article>
          <article className="landing-step">
            <span>3</span>
            <h3>Corrija com foco</h3>
            <p>Use os gaps por jogador e time para definir treino e decisao de round.</p>
          </article>
        </div>
      </section>

      <section className="landing-section">
        <header>
          <p className="landing-kicker">Precos</p>
          <h2>Planos para solo queue, duo e time fechado</h2>
        </header>
        <div className="landing-pricing">
          <article className="price-card">
            <p className="price-name">Starter</p>
            <p className="price-value">R$ 0<span>/mes</span></p>
            <p className="price-desc">Para testar a plataforma com limite mensal.</p>
            <ul>
              <li>10 demos por mes</li>
              <li>Visao geral da partida</li>
              <li>Insights basicos de jogador</li>
            </ul>
            <button type="button" onClick={onStart}>Comecar gratis</button>
          </article>

          <article className="price-card featured">
            <p className="price-badge">Mais usado</p>
            <p className="price-name">Pro</p>
            <p className="price-value">R$ 39<span>/mes</span></p>
            <p className="price-desc">Para quem quer evolucao continua com mais profundidade.</p>
            <ul>
              <li>Demos ilimitadas</li>
              <li>Todas as abas e comparativos</li>
              <li>Historico e tendencias</li>
              <li>Exportacao de relatorios</li>
            </ul>
            <button type="button" onClick={onStart}>Assinar Pro</button>
          </article>

          <article className="price-card">
            <p className="price-name">Team</p>
            <p className="price-value">R$ 129<span>/mes</span></p>
            <p className="price-desc">Para analise de lineup completa com workflow de staff.</p>
            <ul>
              <li>Ate 15 jogadores</li>
              <li>Paineis por time e por lado</li>
              <li>Comparativo entre scrims</li>
              <li>Suporte prioritario</li>
            </ul>
            <button type="button" onClick={onStart}>Falar com vendas</button>
          </article>
        </div>
      </section>

      <section className="landing-section landing-cta">
        <h2>Pronto para parar de jogar no achismo?</h2>
        <p>Entre no Analyzer e suba sua primeira demo agora.</p>
        <div className="landing-actions">
          <button type="button" className="landing-primary-btn" onClick={onStart}>
            Entrar no Analyzer
          </button>
        </div>
      </section>
    </main>
  )
}

