"use strict";

// TƏHLÜKƏSİZLİK QEYDİ: Render.com-dakı backend linkini bura yaz. 
// Sonunda slash (/) olmasın. Məsələn: "https://gradient-api.onrender.com"
const API_BASE_URL = "https://gradient-backend-fam5.onrender.com"; 

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elementləri
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.auth-section');
    const roleInputs = document.querySelectorAll('input[name="user_role"]');
    const fieldGrade = document.getElementById('field-grade');
    const fieldSubject = document.getElementById('field-subject');
    const gradeSelect = document.getElementById('reg-grade');
    const subjectSelect = document.getElementById('reg-subject');
    const globalError = document.getElementById('global-error');

    // 1. TAB DƏYİŞDİRMƏ MƏNTİQİ
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetId = tab.getAttribute('data-target');
            
            sections.forEach(sec => {
                sec.classList.remove('active');
                sec.classList.add('hidden');
            });
            
            const targetSection = document.getElementById(targetId);
            targetSection.classList.remove('hidden');
            targetSection.classList.add('active');
            
            hideError();
        });
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'register') {
        const regTab = document.querySelector('[data-target="register-section"]');
        if(regTab) regTab.click();
    }

    // 2. ROL DƏYİŞDİRMƏ MƏNTİQİ
    roleInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const role = e.target.value;
            if (role === 'student') {
                fieldGrade.classList.remove('hidden');
                gradeSelect.setAttribute('required', 'true');
                
                fieldSubject.classList.add('hidden');
                subjectSelect.removeAttribute('required');
            } else if (role === 'tutor') {
                fieldSubject.classList.remove('hidden');
                subjectSelect.setAttribute('required', 'true');
                
                fieldGrade.classList.add('hidden');
                gradeSelect.removeAttribute('required');
            }
        });
    });

    // 3. TƏHLÜKƏSİZLİK VƏ VALIDASİYA
    const showError = (message, isSuccess = false) => {
        globalError.textContent = message; // XSS müdafiəsi üçün textContent
        globalError.classList.remove('hidden', 'alert-danger', 'alert-success');
        globalError.classList.add(isSuccess ? 'alert-success' : 'alert-danger');
    };

    const hideError = () => {
        globalError.classList.add('hidden');
        globalError.textContent = '';
    };

    const isValidIdentifier = (val) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^(050|051|055|070|077|099)\d{7}$/;
        return emailRegex.test(val) || phoneRegex.test(val);
    };

    // 4. GİRİŞ (LOGIN) FORMASININ GÖNDƏRİLMƏSİ
    const loginForm = document.getElementById('login-form');
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const identifier = document.getElementById('login-identifier').value.trim();
            const password = document.getElementById('login-password').value;

            if (!identifier || !password) {
                return showError("Zəhmət olmasa bütün sahələri doldurun.");
            }

            const submitBtn = document.getElementById('login-submit');
            const btnText = submitBtn.querySelector('.btn-text');
            const loader = submitBtn.querySelector('.loader');
            
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');
            submitBtn.disabled = true;

            try {
                const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    credentials: 'include', // ÇOX ÖNƏMLİ: HttpOnly cookie-ni qəbul etmək üçün
                    body: JSON.stringify({ identifier, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || "Giriş zamanı xəta baş verdi.");
                }
                
                // Giriş uğurludur, rola görə yönləndir
                if (data.role === 'student') {
                    window.location.href = 'exam.html';
                } else if (data.role === 'tutor') {
                    window.location.href = 'tutor-dashboard.html';
                } else {
                    window.location.href = 'index.html';
                }
                
            } catch (error) {
                showError(error.message);
            } finally {
                btnText.classList.remove('hidden');
                loader.classList.add('hidden');
                submitBtn.disabled = false;
            }
        });
    }

    // 5. QEYDİYYAT (REGISTER) FORMASININ GÖNDƏRİLMƏSİ
    const registerForm = document.getElementById('register-form');
    if(registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const role = document.querySelector('input[name="user_role"]:checked').value;
            const firstName = document.getElementById('reg-name').value.trim();
            const lastName = document.getElementById('reg-surname').value.trim();
            const identifier = document.getElementById('reg-identifier').value.trim();
            const password = document.getElementById('reg-password').value;
            const passwordConfirm = document.getElementById('reg-password-confirm').value;
            
            let specificData = "";
            if (role === 'student') {
                specificData = document.getElementById('reg-grade').value;
                if (!specificData) return showError("Zəhmət olmasa sinif seçin.");
            } else {
                specificData = document.getElementById('reg-subject').value;
                if (!specificData) return showError("Zəhmət olmasa fənn seçin.");
            }

            if (!firstName || !lastName || !identifier || !password) {
                return showError("Zəhmət olmasa bütün sahələri doldurun.");
            }

            if (!isValidIdentifier(identifier)) {
                return showError("Düzgün E-poçt və ya Mobil nömrə (məs: 0501234567) daxil edin.");
            }

            if (password.length < 8) {
                return showError("Şifrə ən azı 8 simvoldan ibarət olmalıdır.");
            }

            if (password !== passwordConfirm) {
                return showError("Şifrələr uyğun gəlmir.");
            }

            const submitBtn = document.getElementById('register-submit');
            const btnText = submitBtn.querySelector('.btn-text');
            const loader = submitBtn.querySelector('.loader');
            
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');
            submitBtn.disabled = true;

            try {
                const payload = {
                    role,
                    first_name: firstName,
                    last_name: lastName,
                    identifier,
                    password,
                    grade: role === 'student' ? specificData : null,
                    subject: role === 'tutor' ? specificData : null
                };

                const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    // Backend-dən gələn Pydantic validasiya xətalarını və ya xüsusi xətaları tuturuq
                    const errorMsg = Array.isArray(data.detail) 
                        ? data.detail[0].msg 
                        : data.detail || "Qeydiyyat zamanı xəta baş verdi.";
                    throw new Error(errorMsg);
                }
                
                // Qeydiyyat uğurludur
                showError("Qeydiyyat uğurla tamamlandı! İndi giriş edə bilərsiniz.", true);
                registerForm.reset();
                
                // 2 saniyə sonra avtomatik Giriş tabına keçiririk
                setTimeout(() => {
                    const loginTab = document.querySelector('[data-target="login-section"]');
                    if(loginTab) loginTab.click();
                }, 2000);
                
            } catch (error) {
                showError(error.message);
            } finally {
                btnText.classList.remove('hidden');
                loader.classList.add('hidden');
                submitBtn.disabled = false;
            }
        });
    }
});