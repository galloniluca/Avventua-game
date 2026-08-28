import type { ProviderAi, RichiestaAi, RispostaAi } from './provider';

/**
 * Dungeon Master finto, senza rete e senza chiavi API.
 *
 * Serve a provare l'app end-to-end prima di avere una chiave Gemini: la
 * narrazione è precotta, ma passa dallo stesso contratto del DM vero, quindi
 * esercita davvero tiri di dado, XP, danni, stato del mondo e riassunti.
 * Non è il gioco: è l'impalcatura del gioco che si muove.
 */
export class DemoProvider implements ProviderAi {
  readonly nome = 'demo';

  private turno = 0;

  async chiamaAI(richiesta: RichiestaAi): Promise<RispostaAi> {
    const ultimo = richiesta.messaggi.at(-1)?.testo ?? '';

    // Senza schema la chiamata è di memoria narrativa (delta/consolidamento/racconto).
    if (!richiesta.schema) {
      return this.risposta(testoDiMemoria(ultimo));
    }

    if (ultimo.includes('Apri la campagna')) {
      return this.risposta(JSON.stringify(incipit()));
    }
    if (ultimo.startsWith('Risultato del tiro')) {
      return this.risposta(JSON.stringify(esitoTiro(ultimo)));
    }
    return this.risposta(JSON.stringify(this.reazione(ultimo)));
  }

  private risposta(testo: string): RispostaAi {
    return {
      testo,
      json: testo.trimStart().startsWith('{') ? JSON.parse(testo) : undefined,
      provider: this.nome,
      modello: 'demo',
    };
  }

  /** Ogni terzo turno il DM chiede un tiro, così si vede anche il dado. */
  private reazione(messaggio: string): RispostaDemo {
    this.turno++;
    const azione = messaggio.replace(/^.*? agisce:\s*/s, '').split('\n')[0] ?? '';
    const scena = SCENE[this.turno % SCENE.length]!;

    if (this.turno % 3 === 0) {
      return {
        ...base(),
        narrazione: `${scena.attesa} ${eco(azione)}`,
        richiesta_tiro: {
          serve: true,
          notazione: '1d20',
          caratteristica: scena.caratteristica,
          competenza: false,
          cd: scena.cd,
          vantaggio: 'nessuno',
          motivo: scena.motivo,
        },
      };
    }

    return {
      ...base(),
      narrazione: `${scena.libera} ${eco(azione)}`,
      xp_assegnati: this.turno % 4 === 0 ? 50 : 0,
      aggiornamenti_mondo: [
        { percorso: `luoghi.${scena.luogo}.visitato`, valore: 'si' },
      ],
    };
  }
}

interface RichiestaTiroDemo {
  serve: boolean;
  notazione: string;
  caratteristica: string;
  competenza: boolean;
  cd: number;
  vantaggio: string;
  motivo: string;
}

interface RispostaDemo {
  narrazione: string;
  richiesta_tiro: RichiestaTiroDemo;
  aggiornamenti_mondo: Array<{ percorso: string; valore: string }>;
  nuove_entita: Array<{ categoria: string; nome: string; descrizione: string; dati: string }>;
  xp_assegnati: number;
  danni_subiti: number;
  cure_ricevute: number;
  fine_sessione_suggerita: boolean;
  campagna_conclusa: boolean;
}

function base(): RispostaDemo {
  return {
    narrazione: '',
    richiesta_tiro: {
      serve: false,
      notazione: '',
      caratteristica: 'nessuna',
      competenza: false,
      cd: 0,
      vantaggio: 'nessuno',
      motivo: '',
    },
    aggiornamenti_mondo: [],
    nuove_entita: [],
    xp_assegnati: 0,
    danni_subiti: 0,
    cure_ricevute: 0,
    fine_sessione_suggerita: false,
    campagna_conclusa: false,
  };
}

/** Rimanda indietro l'azione del giocatore: rende evidente che è stata letta. */
function eco(azione: string): string {
  const pulita = azione.trim().replace(/\s+/g, ' ');
  if (pulita === '') return '';
  const breve = pulita.length > 90 ? `${pulita.slice(0, 90)}…` : pulita;
  return `\n\n(DM di prova: ho ricevuto «${breve}». Con una chiave Gemini configurata, qui ci sarebbe la narrazione vera.)`;
}

const SCENE = [
  {
    libera: 'La strada scende fra due speroni di roccia. Il vento porta odore di pioggia e di ferro vecchio.',
    attesa: 'Il terreno cede sotto il tuo peso e per un attimo il vuoto ti passa accanto.',
    caratteristica: 'destrezza',
    cd: 12,
    motivo: 'Restare in equilibrio sul sentiero franato',
    luogo: 'passo_dei_corvi',
  },
  {
    libera: 'Una porta di quercia, gonfia d\'umidità, resiste. Dietro si sente qualcosa che si sposta piano.',
    attesa: 'Appoggi la spalla al legno e spingi, mentre dall\'altra parte il rumore si ferma di colpo.',
    caratteristica: 'forza',
    cd: 13,
    motivo: 'Forzare la porta gonfia',
    luogo: 'casa_del_guardiano',
  },
  {
    libera: 'La donna dietro il banco ti guarda senza smettere di pulire lo stesso bicchiere da un\'ora.',
    attesa: 'Le tue parole restano sospese. Lei valuta se crederti.',
    caratteristica: 'carisma',
    cd: 14,
    motivo: 'Convincere la locandiera a parlare',
    luogo: 'cane_storto',
  },
  {
    libera: 'Fra le rovine, una lastra incisa: caratteri che non riconosci, ma il disegno sì.',
    attesa: 'Ti chini sulle incisioni cercando un senso nella sequenza dei simboli.',
    caratteristica: 'intelligenza',
    cd: 13,
    motivo: 'Decifrare l\'iscrizione',
    luogo: 'rovine_sospese',
  },
] as const;

function incipit(): RispostaDemo {
  return {
    ...base(),
    narrazione:
      'Piove su Duenpietre da tre giorni, e le strade sono diventate canali di fango.\n\n' +
      'Sei arrivato al tramonto, con il mantello che pesa il doppio e una lettera piegata in quattro dentro la cintura: ' +
      'una richiesta d\'aiuto senza firma, arrivata da qualcuno che sapeva il tuo nome.\n\n' +
      'Sotto la tettoia del Cane Storto due uomini smettono di parlare quando ti vedono passare. ' +
      'Dalla torre dell\'archivio, in cima alla salita, filtra ancora luce.\n\n' +
      '(Questo è il Dungeon Master di prova: risponde senza AI, per farti vedere che tutto funziona. ' +
      'Configurando una chiave Gemini, da qui in poi narra il modello vero.)',
    aggiornamenti_mondo: [{ percorso: 'luoghi.duenpietre.visitato', valore: 'si' }],
  };
}

function esitoTiro(messaggio: string): RispostaDemo {
  const successo = /SUCCESSO/.test(messaggio);
  const critico = /20 naturale/.test(messaggio);
  const disastro = /1 naturale/.test(messaggio);

  if (critico) {
    return {
      ...base(),
      narrazione:
        'Ti riesce meglio di quanto avessi sperato: il gesto è netto, quasi elegante, e per un istante ' +
        'chi ti guarda dimentica di respirare.',
      xp_assegnati: 100,
    };
  }
  if (disastro) {
    return {
      ...base(),
      narrazione:
        'Va male. Non solo fallisci: fallisci rumorosamente, e adesso qualcuno sa esattamente dove sei.',
      danni_subiti: 3,
    };
  }
  return successo
    ? {
        ...base(),
        narrazione: 'Ce la fai, con un margine sottile. Il passaggio è aperto e nessuno sembra essersene accorto.',
        xp_assegnati: 50,
      }
    : {
        ...base(),
        narrazione: 'Non basta. Perdi la presa e paghi il tentativo con un graffio lungo lungo l\'avambraccio.',
        danni_subiti: 2,
      };
}

function testoDiMemoria(prompt: string): string {
  if (prompt.includes('Scrivi il racconto')) {
    return '# La pioggia di Duenpietre\n\nArrivò che pioveva, e se ne andò che pioveva ancora. ' +
      'Fra le due cose ci fu tutto il resto: una lettera senza firma, una porta forzata, ' +
      'una donna che decise di fidarsi.\n\n(Racconto generato dal DM di prova.)';
  }
  if (prompt.includes('consolidat')) {
    return 'Cronaca consolidata (DM di prova): il protagonista raggiunse Duenpietre sotto la pioggia, ' +
      'esplorò le rovine sospese e si fece notare da chi non avrebbe dovuto.';
  }
  return 'Riassunto della sessione (DM di prova): il protagonista arrivò a Duenpietre, ' +
    'seguì la traccia della lettera anonima e affrontò il primo ostacolo del viaggio.';
}
