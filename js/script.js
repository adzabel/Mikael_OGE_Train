// Современный JavaScript с использованием ES6+ возможностей
const API_BASE = 'https://mikael-ogetrain-karinausadba.amvera.io';

class OGEClass {
    constructor() {
        this.questions = [];
        this.currentQuestion = 0;
        this.score = 0;
        this.userAnswers = [];
        this.currentSection = 'all';
        this.currentSubsection = 'all';
        this.filteredQuestions = [];
        this.testHistory = [];
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.loadQuestions();
        this.updateQuestionCount();
        this.updateProgressBar();
        this.loadTestHistory();
    }
    
    setupEventListeners() {
        // Навигация по экранам
        document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.showScreen(e.currentTarget.dataset.screen);
                this.updateActiveNav(e.currentTarget, '.nav-btn[data-screen]');
            });
        });
        
        // Навигация по разделам практики
        document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectSection(e.currentTarget.dataset.section);
                this.updateActiveNav(e.currentTarget, '.nav-btn[data-section]');
            });
        });
        
        // Навигация по подразделам
        document.querySelectorAll('.subsection-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.currentTarget.closest('.subsection-nav').id.replace('-subsections', '');
                this.selectSubsection(section, e.currentTarget.dataset.subsection);
                this.updateActiveNav(e.currentTarget, `.subsection-btn[data-subsection]`);
            });
        });
        
        // Кнопки действий
        const answerBtn = document.getElementById('answer-btn');
        if (answerBtn) answerBtn.addEventListener('click', () => this.checkAnswer());
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextQuestion());
        const shuffleBtn = document.getElementById('shuffle-btn');
        if (shuffleBtn) shuffleBtn.addEventListener('click', () => this.shuffleQuestions());
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) restartBtn.addEventListener('click', () => this.restartTest());
        
        // Глобальные кнопки
        document.querySelectorAll('.btn[data-screen]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.showScreen(e.currentTarget.dataset.screen);
            });
        });
    }
    
    showScreen(screenName) {
        // Скрыть все экраны
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Показать выбранный экран
        const el = document.getElementById(`${screenName}-screen`);
        if (el) el.classList.add('active');
        
        // Специальные действия для некоторых экранов
        if (screenName === 'practice') {
            this.showSubsections(this.currentSection);
        } else if (screenName === 'results') {
            this.updateResultsScreen();
        }
    }
    
    updateActiveNav(activeBtn, selector = '.nav-btn') {
        // Убрать активный класс у всех кнопок
        document.querySelectorAll(selector).forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Добавить активный класс к текущей кнопке
        if (activeBtn) activeBtn.classList.add('active');
    }
    
    selectSection(section) {
        this.currentSection = section;
        this.currentSubsection = 'all';
        this.showSubsections(section);
        // Если выбран раздел "Грамматика", подгружаем тест с id_test = 1
        if (section === 'grammar') {
            (async () => {
                try {
                    // Если список тестов ещё не загружен, подгружаем его
                    if (!this.tests || this.tests.length === 0) {
                        await this.loadQuestions();
                    }

                    // Найдём тест с полем id_test === 1 в полученном списке
                    let targetId = 1;
                    if (Array.isArray(this.tests) && this.tests.length > 0) {
                        const found = this.tests.find(t => Number(t.id_test) === 1 || Number(t.id) === 1);
                        if (found) targetId = found.id_test || found.id || 1;
                    }

                    await this.loadTestById(targetId);
                    this.filterQuestions();
                    this.updateQuestionCount();

                    // Если тест уже начат, перезапускаем
                    if (this.isTestStarted()) {
                        this.restartTest();
                    } else {
                        this.updateQuestionDisplay();
                    }
                } catch (err) {
                    console.error('Ошибка при загрузке теста grammar:', err);
                    this.questions = [];
                    this.filteredQuestions = [];
                    this.updateQuestionDisplay();
                }
            })();

            return;
        }

        this.filterQuestions();
        this.updateQuestionCount();

        // Если тест уже начат, перезапускаем
        if (this.isTestStarted()) {
            this.restartTest();
        } else {
            this.updateQuestionDisplay();
        }
    }
    
    selectSubsection(section, subsection) {
        this.currentSubsection = subsection;
        this.filterQuestions();
        this.updateQuestionCount();
        
        // Если тест уже начат, перезапускаем
        if (this.isTestStarted()) {
            this.restartTest();
        } else {
            this.updateQuestionDisplay();
        }
    }
    
    showSubsections(section) {
        // Скрыть все подразделы
        document.querySelectorAll('.subsection-nav').forEach(nav => {
            nav.classList.remove('active');
        });
        
        // Показать подразделы для выбранного раздела
        if (section === 'spelling' || section === 'grammar') {
            const el = document.getElementById(`${section}-subsections`);
            if (el) el.classList.add('active');
        }
    }
    
    async loadQuestions() {
        // Загружаем тесты и вопросы с backend (Postgres)
        try {
            const testsResp = await fetch(`${API_BASE}/api/tests`);
            if (!testsResp.ok) throw new Error('Не удалось загрузить список тестов');
            const tests = await testsResp.json();
            this.tests = tests;

            // Выбираем первый тест по умолчанию
            const defaultTestId = tests.length > 0 ? tests[0].id_test : null;
            if (!defaultTestId) {
                this.questions = [];
                this.filteredQuestions = [];
                return;
            }

            const qResp = await fetch(`${API_BASE}/api/tests/${defaultTestId}/questions`);
            if (!qResp.ok) throw new Error('Не удалось загрузить вопросы');
            const questions = await qResp.json();

            // Приводим к формату, ожидаемому фронтендом
            this.questions = questions.map(q => ({
                questions_id: q.questions_id,
                question: q.question_text,
                type: q.question_type,
                answers: q.answers || [],
                correct: q.correct,
                explanation: q.explanation || ''
            }));

            this.filteredQuestions = [...this.questions];
        } catch (err) {
            console.error('loadQuestions error:', err);
            this.questions = [];
            this.filteredQuestions = [];
        }
    }

    async loadTestById(testId) {
        // Загружаем конкретный тест по id
        try {
            const qResp = await fetch(`${API_BASE}/api/tests/${testId}/questions`);
            if (!qResp.ok) throw new Error('Не удалось загрузить вопросы теста ' + testId);
            const questions = await qResp.json();

            this.questions = questions.map(q => ({
                questions_id: q.questions_id,
                question: q.question_text,
                type: q.question_type,
                answers: q.answers || [],
                correct: q.correct,
                explanation: q.explanation || ''
            }));

            this.filteredQuestions = [...this.questions];
        } catch (err) {
            console.error('loadTestById error:', err);
            throw err;
        }
    }
    
    loadTestHistory() {
        // Загрузка истории тестов (пока пустой массив)
        this.testHistory = [];
    }
    
    filterQuestions() {
        if (this.currentSection === 'all') {
            this.filteredQuestions = [...this.questions];
        } else if (this.currentSubsection === 'all') {
            this.filteredQuestions = this.questions.filter(q => q.section === this.currentSection);
        } else {
            this.filteredQuestions = this.questions.filter(q => 
                q.section === this.currentSection && q.subsection === this.currentSubsection
            );
        }
    }
    
    updateQuestionCount() {
        // Можно добавить отображение количества вопросов где-нибудь в интерфейсе
    }
    
    updateQuestionDisplay() {
        if (this.filteredQuestions.length === 0) {
            const qt = document.getElementById('question-text');
            if (qt) qt.textContent = 'В выбранном разделе пока нет вопросов';
            const ac = document.getElementById('answers-container');
            if (ac) ac.innerHTML = '';
            const ab = document.getElementById('answer-btn');
            if (ab) ab.style.display = 'none';
        } else {
            const qt = document.getElementById('question-text');
            if (qt) qt.textContent = 'Нажмите "Начать практику" для старта';
            const ab = document.getElementById('answer-btn');
            if (ab) ab.style.display = 'inline-block';
        }
    }
    
    shuffleQuestions() {
        // Перемешивание вопросов
        for (let i = this.filteredQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.filteredQuestions[i], this.filteredQuestions[j]] = 
            [this.filteredQuestions[j], this.filteredQuestions[i]];
        }
        
        // Если тест уже начат, перезапускаем
        if (this.isTestStarted()) {
            this.restartTest();
        } else {
            this.updateQuestionCount();
        }
    }
    
    startTest() {
        if (this.filteredQuestions.length === 0) {
            alert('В выбранном разделе нет вопросов. Добавьте задания в базу вопросов.');
            return;
        }
        
        this.showScreen('practice');
        this.currentQuestion = 0;
        this.score = 0;
        this.userAnswers = [];
        this.showQuestion();
    }
    
    showQuestion() {
        if (this.currentQuestion >= this.filteredQuestions.length) {
            this.showResults();
            return;
        }
        
        const q = this.filteredQuestions[this.currentQuestion];
        const qt = document.getElementById('question-text');
        if (qt) qt.textContent = `${this.currentQuestion + 1}. ${q.question}`;
        
        const answersContainer = document.getElementById('answers-container');
        if (answersContainer) answersContainer.innerHTML = '';
        
        // Обновляем прогресс-бар
        this.updateProgressBar();
        
        // Сбрасываем результат и объяснение
        const resultDiv = document.getElementById('result');
        if (resultDiv) {
            resultDiv.innerHTML = '';
            resultDiv.className = 'result hidden';
        }
        
        const explanationDiv = document.getElementById('explanation');
        if (explanationDiv) {
            explanationDiv.innerHTML = '';
            explanationDiv.classList.add('hidden');
        }
        
        // Показываем кнопку "Ответить", скрываем "Далее"
        const answerBtn = document.getElementById('answer-btn');
        if (answerBtn) answerBtn.style.display = 'inline-block';
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) nextBtn.style.display = 'none';
        
        // Создаем варианты ответов в зависимости от типа вопроса
        if (!q) return;
        switch(q.type) {
            case 'single':
                q.answers.forEach((answer, index) => {
                    const option = document.createElement('div');
                    option.className = 'option';
                    option.innerHTML = `
                        <input type="radio" name="answer" value="${index}" id="option-${index}">
                        <label for="option-${index}">${answer}</label>
                    `;
                    option.addEventListener('click', () => {
                        document.querySelectorAll('.option').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                        option.classList.add('selected');
                        const inp = option.querySelector('input');
                        if (inp) inp.checked = true;
                    });
                    answersContainer.appendChild(option);
                });
                break;
            case 'multiple':
                q.answers.forEach((answer, index) => {
                    const option = document.createElement('div');
                    option.className = 'option';
                    option.innerHTML = `
                        <input type="checkbox" name="answer" value="${index}" id="option-${index}">
                        <label for="option-${index}">${answer}</label>
                    `;
                    option.addEventListener('click', () => {
                        const checkbox = option.querySelector('input');
                        if (!checkbox) return;
                        checkbox.checked = !checkbox.checked;
                        option.classList.toggle('selected', checkbox.checked);
                    });
                    answersContainer.appendChild(option);
                });
                break;
            case 'text':
                if (answersContainer) answersContainer.innerHTML = `
                    <input type="text" class="text-input" id="text-answer" placeholder="Введите ваш ответ">
                `;
                break;
        }
    }
    
    updateProgressBar() {
        const progress = this.filteredQuestions.length > 0 ? 
            ((this.currentQuestion) / this.filteredQuestions.length) * 100 : 0;
        const bar = document.getElementById('progress-bar');
        if (bar) bar.style.width = `${progress}%`;
        const text = document.getElementById('progress-text');
        if (text) text.textContent = `${Math.round(progress)}%`;
    }
    
    checkAnswer() {
        const q = this.filteredQuestions[this.currentQuestion];
        let isCorrect = false;
        let userAnswer = '';
        
        if (!q) return;
        switch(q.type) {
            case 'single': {
                const selected = document.querySelector('input[name="answer"]:checked');
                if (selected) {
                    userAnswer = parseInt(selected.value);
                    isCorrect = userAnswer === q.correct;
                } else {
                    alert('Пожалуйста, выберите ответ!');
                    return;
                }
                break;
            }
            case 'multiple': {
                const selectedMultiple = Array.from(document.querySelectorAll('input[name="answer"]:checked'))
                    .map(input => parseInt(input.value));
                if (selectedMultiple.length === 0) {
                    alert('Пожалуйста, выберите хотя бы один ответ!');
                    return;
                }
                userAnswer = selectedMultiple;
                isCorrect = this.arraysEqual(selectedMultiple, q.correct);
                break;
            }
            case 'text': {
                const textEl = document.getElementById('text-answer');
                const textAnswer = textEl ? textEl.value.trim().toLowerCase() : '';
                if (textAnswer === '') {
                    alert('Пожалуйста, введите ответ!');
                    return;
                }
                userAnswer = textAnswer;
                isCorrect = textAnswer === q.correct.toLowerCase();
                break;
            }
        }
        
        // Сохраняем ответ пользователя
        this.userAnswers[this.currentQuestion] = {
            question: q.question,
            userAnswer,
            correctAnswer: q.correct,
            isCorrect
        };
        
        // Показываем результат
        const resultDiv = document.getElementById('result');
        if (resultDiv) resultDiv.className = `result ${isCorrect ? 'correct' : 'incorrect'}`;
        
        if (isCorrect) {
            if (resultDiv) resultDiv.innerHTML = '✅ Правильный ответ!';
            this.score++;
        } else {
            if (resultDiv) resultDiv.innerHTML = '❌ Неправильный ответ';
        }
        if (resultDiv) resultDiv.classList.remove('hidden');
        
        // Показываем объяснение
        const explanationDiv = document.getElementById('explanation');
        if (explanationDiv) {
            explanationDiv.innerHTML = `<strong>Объяснение:</strong> ${q.explanation}`;
            explanationDiv.classList.remove('hidden');
        }
        
        // Скрываем кнопку "Ответить", показываем "Далее"
        const answerBtn = document.getElementById('answer-btn');
        if (answerBtn) answerBtn.style.display = 'none';
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) nextBtn.style.display = 'inline-block';
    }
    
    nextQuestion() {
        this.currentQuestion++;
        if (this.currentQuestion < this.filteredQuestions.length) {
            this.showQuestion();
        } else {
            this.showResults();
        }
    }
    
    showResults() {
        // Сохраняем результаты теста
        this.saveTestResults();
        
        this.showScreen('results');
        this.updateResultsScreen();
    }
    
    saveTestResults() {
        const percentage = this.filteredQuestions.length > 0 ? 
            Math.round((this.score / this.filteredQuestions.length) * 100) : 0;
        
        const testResult = {
            date: new Date().toLocaleDateString(),
            score: this.score,
            total: this.filteredQuestions.length,
            percentage: percentage,
            section: this.currentSection,
            subsection: this.currentSubsection
        };
        
        this.testHistory.push(testResult);
    }
    
    updateResultsScreen() {
        const percentage = this.filteredQuestions.length > 0 ? 
            Math.round((this.score / this.filteredQuestions.length) * 100) : 0;
        
        // Обновляем круговую диаграмму
        const circle = document.getElementById('results-circle');
        if (circle) {
            const circumference = 2 * Math.PI * 40;
            const dashArray = `${(percentage / 100) * circumference} ${circumference}`;
            circle.style.strokeDasharray = dashArray;
        }
        
        // Обновляем текстовые значения
        const resultsPerc = document.getElementById('results-percentage');
        if (resultsPerc) resultsPerc.textContent = `${percentage}%`;
        const currCorrect = document.getElementById('current-correct');
        if (currCorrect) currCorrect.textContent = this.score;
        const currTotal = document.getElementById('current-total');
        if (currTotal) currTotal.textContent = this.filteredQuestions.length;
        
        // Обновляем общую статистику
        const totalScoreEl = document.getElementById('total-score');
        if (totalScoreEl) totalScoreEl.textContent = this.testHistory.length;
        const totalQuestionsEl = document.getElementById('total-questions');
        if (totalQuestionsEl) totalQuestionsEl.textContent = this.testHistory.reduce((sum, test) => sum + test.total, 0);
        
        // Рассчитываем средний и лучший результат
        const average = this.testHistory.length > 0 ? 
            Math.round(this.testHistory.reduce((sum, test) => sum + test.percentage, 0) / this.testHistory.length) : 0;
        const best = this.testHistory.length > 0 ? 
            Math.max(...this.testHistory.map(test => test.percentage)) : 0;
        
        const avgEl = document.getElementById('average-score');
        if (avgEl) avgEl.textContent = `${average}%`;
        const bestEl = document.getElementById('best-score');
        if (bestEl) bestEl.textContent = `${best}%`;
        
        let message = '';
        if (percentage >= 90) {
            message = 'Отличный результат! Вы хорошо подготовлены.';
        } else if (percentage >= 70) {
            message = 'Хороший результат! Есть над чем поработать.';
        } else if (percentage >= 50) {
            message = 'Удовлетворительный результат. Нужно повторить материал.';
        } else if (this.filteredQuestions.length > 0) {
            message = 'Вам нужно серьезно подготовиться к экзамену.';
        } else {
            message = 'Начните практику, чтобы увидеть свои результаты';
        }
        const msgEl = document.getElementById('results-message');
        if (msgEl) msgEl.textContent = message;
    }
    
    restartTest() {
        this.currentQuestion = 0;
        this.score = 0;
        this.userAnswers = [];
        this.showScreen('practice');
        this.updateProgressBar();
        this.showQuestion();
    }
    
    isTestStarted() {
        return this.currentQuestion > 0 || this.userAnswers.length > 0;
    }
    
    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, index) => val === sortedB[index]);
    }
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    window.ogeApp = new OGEClass();
    
    // Добавляем обработчики для кнопок начала практики
    document.querySelectorAll('.btn[data-screen="practice"]').forEach(btn => {
        btn.addEventListener('click', () => {
            window.ogeApp.startTest();
        });
    });
});
