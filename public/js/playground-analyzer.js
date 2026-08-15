// Prompt Rating System and Analyzer combined in one file
class PromptRatingSystem {
  constructor() {
    this.localStorageKey = 'savedPrompts';
    this.savedPrompts = this.loadSavedPrompts();
    this.currentPrompt = '';

    // The modal has to exist before the UI wires itself to it.
    this.createRatingModal();
    this.setupUI();
    this.setupEventListeners();
  }

  loadSavedPrompts() {
    try {
      const saved = localStorage.getItem(this.localStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error loading saved prompts:', error);
      return [];
    }
  }

  setupUI() {
    try {
      // Add the rate button
      const analyzeButton = document.getElementById('analyzeButton');
      if (!analyzeButton) {
        console.error('Analyze button not found');
        return;
      }

      const rateButton = document.createElement('button');
      rateButton.id = 'rateButton';
      rateButton.className = 'hidden zr-btn';
      rateButton.innerHTML =
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-star"/></svg>Rate Prompt';
      const actionsContainer =
        document.getElementById('analysisActions') || analyzeButton.parentNode;
      actionsContainer.appendChild(rateButton);

      // Build the saved prompts section
      this.createSavedPromptsSection();
      this.addStyles();
    } catch (error) {
      console.error('Error setting up UI:', error);
    }
  }

  setupEventListeners() {
    try {
      // Rate Button Click
      const rateButton = document.getElementById('rateButton');
      if (rateButton) {
        rateButton.addEventListener('click', () => this.showRatingModal());
      }

      // Modal Event Listeners
      const modal = document.getElementById('ratingModal');
      if (modal) {
        const stars = modal.querySelectorAll('.star-rating button');
        const saveButton = modal.querySelector('#saveRating');
        const closeButton = modal.querySelector('.modal-close');
        let selectedRating = 0;

        stars.forEach((star) => {
          star.addEventListener('click', (e) => {
            const rating = parseInt(e.currentTarget.dataset.rating);
            selectedRating = rating;
            stars.forEach((s) => {
              s.classList.toggle(
                'active',
                parseInt(s.dataset.rating) <= rating
              );
            });
          });
        });

        if (saveButton) {
          saveButton.addEventListener('click', () => {
            if (selectedRating === 0) {
              alert('Please select a rating');
              return;
            }

            const comment = modal.querySelector('#ratingComment')?.value || '';
            this.savePromptRating(selectedRating, comment);
            this.hideRatingModal();
            this.refreshSavedPrompts();
            selectedRating = 0; // Reset rating
          });
        }

        if (closeButton) {
          closeButton.addEventListener('click', () => this.hideRatingModal());
        }

        // Click outside to close
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.hideRatingModal();
          }
        });
      }

      // Clear All Button
      const clearButton = document.getElementById('clearPrompts');
      if (clearButton) {
        clearButton.addEventListener('click', () => {
          if (confirm('Are you sure you want to delete all saved prompts?')) {
            this.clearAllPrompts();
          }
        });
      }
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }

  createRatingModal() {
    if (document.getElementById('ratingModal')) {
      return; // Modal already exists
    }

    const modalHtml = `
            <div id="ratingModal" class="hidden">
                <div class="zr-modal-backdrop"></div>
                <div class="zr-modal-center">
                    <div class="zr-module zr-modal-card" style="background: var(--zr-surface); color: var(--zr-text)">
                        <div class="zr-module__head" style="border-color: var(--zr-line)">
                            <h3 class="zr-module__title">Rate this Prompt</h3>
                            <button class="modal-close zr-btn zr-btn--ghost zr-btn--icon">
                                <svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-x"/></svg>
                            </button>
                        </div>
                        <div class="zr-module__body">
                            <div class="prompt-preview zr-panel" style="background: var(--zr-surface-2)">
                                <code class="zr-sm zr-mono"></code>
                            </div>
                            <div class="star-rating" id="starRating">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) => `
                                    <button data-rating="${i + 1}" class="zr-btn zr-btn--ghost zr-btn--icon">
                                        <svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-star"/></svg>
                                    </button>
                                `
                                ).join('')}
                            </div>
                            <textarea
                                id="ratingComment"
                                placeholder="Add your comments about this prompt..."
                                class="zr-textarea"
                                style="background: var(--zr-surface); border: 1px solid var(--zr-line);"
                                rows="3"
                            ></textarea>
                            <button id="saveRating" class="zr-btn zr-btn--primary zr-btn--block">
                                Save Rating
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  createSavedPromptsSection() {
    const existingSection = document.querySelector('.saved-prompts-section');
    if (existingSection) {
      existingSection.remove();
    }

    const promptsSection = document.createElement('div');
    promptsSection.className = 'zr-module saved-prompts-section';
    // A module head rather than utility classes on the heading: .zr-module__title
    // is display:block, so the space-between never applied and the button ended
    // up jammed against the text with 160px of slack beside it.
    promptsSection.innerHTML = `
            <div class="zr-module__head">
                <h2 class="zr-module__title">Saved Prompts</h2>
                <div class="zr-module__actions">
                    <button id="clearPrompts" class="zr-btn zr-btn--danger">Clear All</button>
                </div>
            </div>
            <div id="savedPromptsList"></div>
        `;

    // Insert after the analysis section
    const analysisSection = document.querySelector('.zr-module');
    if (analysisSection) {
      analysisSection.parentNode.insertBefore(
        promptsSection,
        analysisSection.nextSibling
      );
    }

    this.refreshSavedPrompts();
  }

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
            #ratingModal {
                transition: opacity 0.2s ease-in-out;
            }
            
            #ratingModal.hidden {
                opacity: 0;
                pointer-events: none;
            }
            
            #ratingModal:not(.hidden) {
                opacity: 1;
                pointer-events: auto;
            }

            #ratingModal .prompt-preview {
                max-height: 40vh;
                overflow-y: auto;
                margin-right: -0.5rem;
                padding-right: 0.5rem;
            }

            #ratingModal .prompt-preview code {
                display: block;
                word-break: break-word;
            }

            @media (max-height: 700px) {
                #ratingModal .prompt-preview {
                    max-height: 30vh;
                }
            }

            .star-rating button {
                color: #cbd5e1;
                transition: all 0.2s ease;
            }

            .star-rating button.active,
            .star-rating button:hover {
                color: #eab308;
            }

            .star-rating button:hover ~ button {
                color: #cbd5e1;
            }

            .saved-prompt-card {
                position: relative;
                background: var(--zr-surface);
                border: 1px solid var(--zr-line);
                border-radius: 0.5rem;
                padding: 1rem;
                margin-bottom: 1rem;
                transition: all 0.2s ease;
            }

            .saved-prompt-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }

            .saved-prompt-card .rating {
                color: #eab308;
            }

            .saved-prompt-card .prompt-text {
                font-family: monospace;
                background: var(--zr-surface-2);
                padding: 0.5rem;
                border-radius: 0.25rem;
                margin: 0.5rem 0;
                white-space: pre-wrap;
                word-break: break-all;
            }
        `;
    document.head.appendChild(style);
  }

  showRatingModal() {
    const modal = document.getElementById('ratingModal');
    if (!modal) {
      console.error('Rating modal not found');
      return;
    }

    // Debug-Ausgabe
    console.log('Current prompt:', this.currentPrompt);

    // Setze den Prompt-Text
    const codeElement = modal.querySelector('.prompt-preview code');
    if (codeElement) {
      codeElement.textContent = this.currentPrompt;
    }

    // Reset state
    modal
      .querySelectorAll('.star-rating button')
      .forEach((star) => star.classList.remove('active'));
    const commentField = modal.querySelector('#ratingComment');
    if (commentField) {
      commentField.value = '';
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  hideRatingModal() {
    const modal = document.getElementById('ratingModal');
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  savePromptRating(rating, comment) {
    // Debug-Ausgabe
    console.log('Saving prompt:', this.currentPrompt);

    // Sicherstellen, dass wir einen Prompt haben
    if (!this.currentPrompt) {
      console.error('No prompt to save');
      return;
    }

    const promptData = {
      prompt: this.currentPrompt,
      rating: rating,
      comment: comment,
      date: new Date().toISOString(),
      id: Date.now(),
    };

    // Debug-Ausgabe
    console.log('Saving prompt data:', promptData);

    this.savedPrompts.unshift(promptData);
    try {
      localStorage.setItem(
        this.localStorageKey,
        JSON.stringify(this.savedPrompts)
      );
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  refreshSavedPrompts() {
    const container = document.getElementById('savedPromptsList');
    if (!container) return;

    // No delete-all button over an empty list.
    document
      .getElementById('clearPrompts')
      ?.classList.toggle('hidden', this.savedPrompts.length === 0);

    container.innerHTML =
      this.savedPrompts
        .map(
          (prompt) => `
            <div class="saved-prompt-card" data-id="${prompt.id}">
                <div class="rating zr-strong">
                    ${Array.from({ length: prompt.rating }, () => '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-star"/></svg>').join('')}
                    <span class="zr-sm">${prompt.rating}/10</span>
                </div>
                <div class="prompt-text zr-sm zr-mono">${prompt.prompt}</div>
                ${prompt.comment ? `<div class="zr-sm zr-muted">${prompt.comment}</div>` : ''}
                <div class="zr-xs zr-faint">${window.zrDate.formatDateTime(prompt.date)}</div>
                <div class="saved-prompt-card__actions">
                    <button onclick="window.promptRating.usePrompt(${prompt.id})" 
                            class="zr-btn zr-btn--primary"
                            title="Use this prompt">
                        <svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-play"/></svg>
                    </button>
                    <button onclick="window.promptRating.deletePrompt(${prompt.id})"
                            class="zr-btn zr-btn--danger"
                            title="Delete this prompt">
                        <svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-trash"/></svg>
                    </button>
                </div>
            </div>
        `
        )
        .join('') || '<p class="zr-empty">No saved prompts yet</p>';
  }

  usePrompt(id) {
    const prompt = this.savedPrompts.find((p) => p.id === id);
    if (prompt) {
      const textarea = document.getElementById('analysisPrompt');
      if (textarea) {
        textarea.value = prompt.prompt;
        // Bring the textarea into view and focus it.
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textarea.focus();
      }
    }
  }

  deletePrompt(id) {
    if (confirm('Are you sure you want to delete this prompt?')) {
      this.savedPrompts = this.savedPrompts.filter((p) => p.id !== id);
      localStorage.setItem(
        this.localStorageKey,
        JSON.stringify(this.savedPrompts)
      );
      this.refreshSavedPrompts();
    }
  }

  clearAllPrompts() {
    this.savedPrompts = [];
    localStorage.removeItem(this.localStorageKey);
    this.refreshSavedPrompts();
  }

  setCurrentPrompt(prompt) {
    this.currentPrompt = prompt;
    const rateButton = document.getElementById('rateButton');
    if (rateButton) {
      rateButton.classList.remove('hidden');
    }
  }
}

// Playground Document Analyzer
class PlaygroundAnalyzer {
  constructor() {
    this.analysisPrompt = document.getElementById('analysisPrompt');
    this.analyzeButton = document.getElementById('analyzeButton');
    this.documentsGrid = document.getElementById('documentsGrid');
    this.initialLoadingBlock = document.getElementById(
      'playgroundInitialLoading'
    );
    this.initialLoadingStatus = document.getElementById(
      'playgroundInitialLoadingStatus'
    );
    this.analysisOverlay = document.getElementById('playgroundAnalysisOverlay');
    this.analysisOverlayStatus = document.getElementById(
      'playgroundAnalysisStatus'
    );
    this.isAnalyzing = false;
    this.maxBootstrapWaitMs = 20000;
    this.promptRating = new PromptRatingSystem(); // Initialize rating system here

    this.initialize();
  }

  async initialize() {
    this.analyzeButton.addEventListener('click', () => this.startAnalysis());
    this.analyzeButton.disabled = true;
    this.setupStyles();
    await this.loadBootstrapData();
  }

  setInitialLoadingStatus(message) {
    if (!this.initialLoadingStatus) return;
    this.initialLoadingStatus.textContent = message;
  }

  escapeHtml(value) {
    return `${value ?? ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  formatDocumentDate(dateValue) {
    return window.zrDate.format(dateValue, { fallback: 'Unknown date' });
  }

  renderDocuments(documents, tagNames = {}, correspondentNames = {}) {
    if (!this.documentsGrid) return;

    const cardsMarkup = (Array.isArray(documents) ? documents : [])
      .map((doc) => {
        const safeTitle = this.escapeHtml(doc?.title || 'Untitled');
        const documentId = Number(doc?.id);
        const createdAt = this.formatDocumentDate(doc?.created);
        const tags = Array.isArray(doc?.tags) ? doc.tags : [];

        const tagsMarkup = tags
          .map((tagId) => {
            const normalizedTagId = Number(tagId);
            const tagName = tagNames?.[normalizedTagId] || 'Unknown';
            return `<span class="tag zr-badge zr-badge--brand" data-tag-id="${this.escapeHtml(normalizedTagId)}">${this.escapeHtml(tagName)}</span>`;
          })
          .join('');

        const correspondentId = Number(doc?.correspondent);
        const hasCorrespondent = Number.isInteger(correspondentId);
        const correspondentName = hasCorrespondent
          ? correspondentNames?.[correspondentId] || 'Unknown'
          : '';

        return `
                <div class="zr-module document-card" data-document-id="${this.escapeHtml(documentId)}">
                    <div class="document-card__thumb">
                        <div class="thumbnail-skeleton" data-thumb-skeleton aria-hidden="true"></div>
                        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-thumb-src="/thumb/${this.escapeHtml(documentId)}" alt="${safeTitle}" class="playground-thumb" loading="lazy" decoding="async">
                        <div class="tags-container">${tagsMarkup}</div>
                    </div>
                    <div class="document-info">
                        <div class="info-container">
                            <div class="info-item">
                                <h3 class="zr-sm zr-strong zr-truncate">${safeTitle}</h3>
                            </div>
                            <div class="info-item">
                                <p class="zr-xs zr-muted zr-truncate">${this.escapeHtml(createdAt)}</p>
                                ${hasCorrespondent ? `<p class="zr-xs zr-muted zr-truncate" data-correspondent="${this.escapeHtml(correspondentId)}">${this.escapeHtml(correspondentName)}</p>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
      })
      .join('');

    this.documentsGrid.innerHTML = cardsMarkup;
  }

  async loadBootstrapData() {
    if (!this.documentsGrid) {
      this.setInitialLoadingStatus('Document grid unavailable.');
      return;
    }

    this.setInitialLoadingStatus('Loading document metadata...');

    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(
        () => abortController.abort(),
        this.maxBootstrapWaitMs
      );
      const response = await fetch('/api/playground/bootstrap', {
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to load playground data');
      }

      const payload = await response.json();
      if (!payload?.success) {
        throw new Error(
          payload?.error || 'Invalid playground bootstrap response'
        );
      }

      const documents = Array.isArray(payload.documents)
        ? payload.documents
        : [];
      this.renderDocuments(
        documents,
        payload.tagNames || {},
        payload.correspondentNames || {}
      );

      if (documents.length === 0) {
        this.setInitialLoadingStatus('No documents available.');
        this.initialLoadingBlock?.setAttribute('aria-busy', 'false');
        setTimeout(
          () => this.initialLoadingBlock?.classList.add('hidden'),
          250
        );
        this.analyzeButton.disabled = false;
        return;
      }

      this.setInitialLoadingStatus(
        `Loaded ${documents.length} documents. Loading thumbnails...`
      );
      await this.initializeThumbnailLoadingState();
      this.analyzeButton.disabled = false;
    } catch (error) {
      console.error('Error loading playground bootstrap data:', error);
      this.setInitialLoadingStatus(
        'Failed to load playground data. Please refresh the page.'
      );
      this.initialLoadingBlock?.setAttribute('aria-busy', 'false');
      this.analyzeButton.disabled = false;
    }
  }

  async initializeThumbnailLoadingState() {
    if (!this.documentsGrid || !this.initialLoadingBlock) return;

    const images = Array.from(
      this.documentsGrid.querySelectorAll('.playground-thumb[data-thumb-src]')
    );
    if (images.length === 0) {
      this.initialLoadingBlock.classList.add('hidden');
      this.initialLoadingBlock.setAttribute('aria-busy', 'false');
      return;
    }

    const total = images.length;
    let loaded = 0;
    let failed = 0;
    const concurrency = Math.min(6, total);

    const updateInitialStatus = () => {
      if (!this.initialLoadingStatus) return;
      const finished = loaded + failed;
      if (finished >= total) {
        this.initialLoadingStatus.textContent = `Loaded ${loaded}/${total} thumbnails.`;
        return;
      }
      this.initialLoadingStatus.textContent = `Loading thumbnails ${finished}/${total}...`;
    };

    const revealThumbnail = (image, success = true) => {
      const skeleton = image.parentElement?.querySelector(
        '[data-thumb-skeleton]'
      );
      if (skeleton) {
        skeleton.classList.add('hidden');
      }

      if (success) {
        image.classList.add('is-ready');
      }
    };

    const loadThumbnail = (image) => {
      return new Promise((resolve) => {
        const source = image.dataset.thumbSrc;
        if (!source) {
          failed += 1;
          revealThumbnail(image, false);
          updateInitialStatus();
          resolve();
          return;
        }

        const onLoad = () => {
          clearTimeout(timeoutId);
          loaded += 1;
          revealThumbnail(image, true);
          updateInitialStatus();
          resolve();
        };

        const onError = () => {
          clearTimeout(timeoutId);
          failed += 1;
          revealThumbnail(image, false);
          updateInitialStatus();
          resolve();
        };

        const timeoutId = setTimeout(() => {
          failed += 1;
          revealThumbnail(image, false);
          updateInitialStatus();
          resolve();
        }, 15000);

        image.addEventListener('load', onLoad, { once: true });
        image.addEventListener('error', onError, { once: true });
        image.src = source;
      });
    };

    const runWorkers = async () => {
      let nextIndex = 0;

      const workers = Array.from({ length: concurrency }, async () => {
        while (nextIndex < images.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          await loadThumbnail(images[currentIndex]);
        }
      });

      await Promise.all(workers);
    };

    updateInitialStatus();
    await runWorkers();

    this.initialLoadingBlock.setAttribute('aria-busy', 'false');
    setTimeout(() => {
      this.initialLoadingBlock.classList.add('hidden');
    }, 200);
  }

  setAnalysisLoadingState(isLoading, statusText = 'Analyzing documents...') {
    if (!this.analysisOverlay) return;

    this.analysisOverlay.classList.toggle('hidden', !isLoading);
    this.analysisOverlay.setAttribute(
      'aria-busy',
      isLoading ? 'true' : 'false'
    );

    if (this.analysisOverlayStatus) {
      this.analysisOverlayStatus.textContent = statusText;
    }
  }

  setupStyles() {
    const style = document.createElement('style');
    style.textContent = `
            /* Card design */
            .document-card {
                display: flex;
                flex-direction: column;
            }

            .document-info {
                flex-grow: 1;
                min-height: 8rem;
                padding: 0.75rem;
            }

            /* Text information container */
            .info-container {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                margin-top: 0.5rem;
            }

            .info-item {
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }

            /* Highlighting */
            .document-card.updated {
                animation: highlight 2s ease-in-out;
            }
            
            @keyframes highlight {
                0% { box-shadow: 0 0 0 2px var(--zr-brand); }
                100% { box-shadow: none; }
            }
            
            /* Tag styles */
            .tag.new-tag {
                background: #22c55e !important;
                animation: fadeIn 0.5s ease-in-out;
            }

            .tag.updated-tag {
                background: #eab308 !important;
                animation: fadeIn 0.5s ease-in-out;
            }

            /* Text updates */
            .updated-text {
                color: var(--zr-brand);
                font-weight: 600;
            }

            .updated-text::after {
                content: '(updated)';
                font-size: 0.75rem;
                color: #22c55e;
                font-weight: normal;
                margin-left: 0.5rem;
            }

            .old-value {
                text-decoration: line-through;
                color: #94a3b8;
                font-size: 0.75rem;
                margin-top: 0.25rem;
                display: block;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* Tag overlay, pinned to the top of the thumbnail frame */
            .tags-container {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                display: flex;
                flex-wrap: wrap;
                gap: 0.25rem;
                padding: 0.5rem;
                min-height: 2.5rem;
            }

            /* Responsive layout */
            @media (max-width: 1536px) {
                .document-info {
                    min-height: 10rem;
                }
            }

            /* Highlighting for the current document */
            .document-card.processing {
                box-shadow: 0 0 0 2px #60a5fa;
                transform: scale(1.02);
                transition: all 0.3s ease-in-out;
                position: relative;
            }

            .document-card.processing::after {
                content: 'Processing...';
                position: absolute;
                top: 0.5rem;
                right: 0.5rem;
                background: #60a5fa;
                color: white;
                padding: 0.25rem 0.5rem;
                border-radius: 0.25rem;
                font-size: 0.75rem;
                animation: pulse 1.5s infinite;
            }

            @keyframes pulse {
                0% { opacity: 0.6; }
                50% { opacity: 1; }
                100% { opacity: 0.6; }
            }
        `;
    document.head.appendChild(style);
  }

  async startAnalysis() {
    if (this.isAnalyzing) return;

    const prompt = this.analysisPrompt.value.trim();
    if (!prompt) {
      this.showMessage('Please enter an analysis prompt', 'error');
      return;
    }

    this.isAnalyzing = true;
    this.analyzeButton.disabled = true;
    this.setAnalysisLoadingState(true, 'Starting analysis...');
    this.showMessage('Starting document analysis...', 'info');

    try {
      const documents = Array.from(this.documentsGrid.children);
      for (const [index, docCard] of documents.entries()) {
        this.setAnalysisLoadingState(
          true,
          `Analyzing document ${index + 1} of ${documents.length}...`
        );
        this.showMessage(
          `Analyzing document ${index + 1} of ${documents.length}...`,
          'info'
        );

        docCard.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        docCard.classList.add('processing');
        await this.analyzeDocument(docCard, prompt);
        docCard.classList.remove('processing');

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      // Hier ist die wichtige Änderung - speichere den Prompt direkt
      window.promptRating.currentPrompt = prompt; // Direkter Zugriff
      window.promptRating.setCurrentPrompt(prompt); // Aktiviere den Rate Button

      this.showMessage('Analysis completed successfully', 'success');
    } catch (error) {
      console.error('Analysis error:', error);
      this.showMessage('Error during analysis: ' + error.message, 'error');
    } finally {
      this.isAnalyzing = false;
      this.analyzeButton.disabled = false;
      this.setAnalysisLoadingState(false);
    }
  }

  async analyzeDocument(docCard, prompt) {
    const docId = docCard.dataset.documentId;
    if (!docId) return;

    try {
      // Dokument-Content abrufen
      const contentResponse = await fetch(`/manual/preview/${docId}`);
      if (!contentResponse.ok)
        throw new Error('Failed to fetch document content');
      const contentData = await contentResponse.json();

      // Bestehende Tags und Correspondent erfassen
      const existingTags = Array.from(docCard.querySelectorAll('.tag')).map(
        (tag) => ({
          id: tag.dataset.tagId,
          name: tag.textContent.trim(),
        })
      );

      const existingCorrespondent = docCard.querySelector(
        '[data-correspondent]'
      )?.dataset.correspondent;
      const existingTitle = docCard.querySelector('h3').textContent;

      // Analyse durchführen
      const analysisResponse = await fetch('/manual/playground', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: contentData.content,
          existingTags: existingTags.map((t) => t.id),
          correspondent: existingCorrespondent,
          prompt: prompt,
          documentId: docId,
        }),
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const result = await analysisResponse.json();

      // Karte aktualisieren
      await this.updateDocumentCard(docCard, result.document, {
        existingTags,
        existingCorrespondent,
        existingTitle,
      });
    } catch (error) {
      console.error(`Error analyzing document ${docId}:`, error);
      this.showMessage(
        `Error analyzing document ${docId}: ${error.message}`,
        'warning'
      );
    }
  }

  async updateDocumentCard(docCard, analysisResult, existing) {
    // Tags aktualisieren
    console.log('Existing Data:', existing);
    if (analysisResult.tags && analysisResult.tags.length > 0) {
      const tagsContainer = docCard.querySelector(
        '.tags-container, div[class*="flex flex-wrap gap"]'
      );
      if (tagsContainer) {
        const existingTagIds = existing.existingTags.map((t) => t.id);

        // Neue Tags hinzufügen
        analysisResult.tags.forEach((tagId) => {
          if (!existingTagIds.includes(tagId)) {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag new-tag zr-badge zr-badge--brand';
            tagSpan.dataset.tagId = tagId;
            tagSpan.textContent = tagId;
            tagsContainer.appendChild(tagSpan);
          }
        });
      }
    }

    // Correspondent aktualisieren
    if (
      analysisResult.correspondent &&
      analysisResult.correspondent !== existing.existingCorrespondent
    ) {
      const correspondentElem = docCard.querySelector('[data-correspondent]');
      if (correspondentElem) {
        // Speichere den ursprünglichen Namen statt der ID
        const oldCorrespondentName = correspondentElem.textContent.trim();
        const infoContainer = document.createElement('div');
        infoContainer.className = 'info-item';

        const newValue = document.createElement('span');
        newValue.className = 'updated-text truncate';
        // Hier müssen wir den neuen Namen aus correspondentNames holen
        newValue.textContent =
          window.correspondentNames?.[analysisResult.correspondent] ||
          analysisResult.correspondent;

        const oldValue = document.createElement('span');
        oldValue.className = 'old-value';
        // Verwende den gespeicherten Namen
        oldValue.textContent = oldCorrespondentName;

        infoContainer.appendChild(newValue);
        infoContainer.appendChild(oldValue);

        correspondentElem.parentNode.replaceChild(
          infoContainer,
          correspondentElem
        );
        infoContainer.dataset.correspondent = analysisResult.correspondent;
      }
    }

    // Titel aktualisieren
    if (
      analysisResult.title &&
      analysisResult.title !== existing.existingTitle
    ) {
      const titleElem = docCard.querySelector('h3');
      if (titleElem) {
        const infoContainer = document.createElement('div');
        infoContainer.className = 'info-item';

        const newValue = document.createElement('span');
        newValue.className = 'updated-text zr-sm zr-strong zr-truncate';
        newValue.textContent = analysisResult.title;

        const oldValue = document.createElement('span');
        oldValue.className = 'old-value';
        oldValue.textContent = existing.existingTitle;

        infoContainer.appendChild(newValue);
        infoContainer.appendChild(oldValue);

        titleElem.parentNode.replaceChild(infoContainer, titleElem);
      }
    }

    // Highlight-Effekt
    docCard.classList.add('updated');
    setTimeout(() => {
      docCard.classList.remove('updated');
    }, 2000);
  }

  showMessage(message, type = 'info') {
    const tones = {
      error: 'danger',
      success: 'ok',
      warning: 'warn',
      info: 'info',
    };
    const icons = {
      danger: 'i-alert-circle',
      ok: 'i-check-circle',
      warn: 'i-alert',
      info: 'i-info',
    };
    const tone = tones[type] || 'info';

    let messageArea = document.getElementById('messageArea');
    if (!messageArea) {
      messageArea = document.createElement('div');
      messageArea.id = 'messageArea';
      const anchor = document.querySelector('.zr-module');
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(messageArea, anchor);
      } else {
        document.querySelector('.zr-view')?.prepend(messageArea);
      }
    }

    messageArea.className = `zr-alert zr-alert--${tone}`;
    messageArea.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    messageArea.innerHTML =
      `<svg class="zr-icon" aria-hidden="true"><use href="/icons.svg#${icons[tone]}"/></svg>` +
      '<div class="zr-alert__body"><p data-message-text></p></div>';

    // Messages can carry error text from the backend, so they are rendered as
    // text rather than interpolated into the markup above.
    messageArea.querySelector('[data-message-text]').textContent = message;

    if (type === 'success') {
      setTimeout(() => {
        messageArea.remove();
      }, 5000);
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.playgroundAnalyzer = new PlaygroundAnalyzer();
  window.promptRating = window.playgroundAnalyzer.promptRating;
});
