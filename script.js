document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Menu Toggle
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const menuClose = document.querySelector('.mobile-menu-close');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-menu a');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        menuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });

        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }

    // 2. Sticky Header Effects
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.padding = '10px 0';
            header.style.background = '#FFFFFF';
        } else {
            header.style.padding = '15px 0';
            header.style.background = '#FFFFFF';
        }
    });

    // 3. Reveal Animations (Intersection Observer)
    const revealElements = document.querySelectorAll('[data-reveal]');
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = entry.target.getAttribute('data-delay') || 0;
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay);
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // 4. FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            // Close other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });
            // Toggle current item
            item.classList.toggle('active');
        });
    });

    // 5. Form Handling
    const assessmentForm = document.getElementById('assessment-form');
    const formSuccess = document.getElementById('form-success');
    const formError = document.getElementById('form-error');
    const fileInput = document.getElementById('cv');
    const fileInputText = document.querySelector('.file-input-text');
    const formSubjectInput = document.getElementById('form-subject');
    const formTarget = document.getElementById('formsubmit-target');
    const defaultFileText = 'Choose your CV (PDF, DOC, DOCX)';

    if (assessmentForm) {
        let pendingIframeResponse = false;
        let submitBtn = null;
        let originalBtnText = '';

        const resetSubmitButton = () => {
            if (submitBtn) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        };

        if (formTarget) {
            formTarget.addEventListener('load', () => {
                if (!pendingIframeResponse) {
                    return;
                }

                pendingIframeResponse = false;
                assessmentForm.classList.add('hidden');
                formSuccess.classList.remove('hidden');
                if (formError) {
                    formError.classList.add('hidden');
                }
                resetSubmitButton();
            });
        }

        assessmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            submitBtn = assessmentForm.querySelector('button[type="submit"]');
            originalBtnText = submitBtn.innerText;
            submitBtn.innerText = 'Sending...';
            submitBtn.disabled = true;

            const formData = new FormData(assessmentForm);
            const name = formData.get('name')?.toString().trim() || '';
            const subject = `Request for Assessment - ${name}`;
            const selectedFile = fileInput?.files?.[0];
            const allowedFileTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];
            const maxFileSizeBytes = 10 * 1024 * 1024;

            if (formSubjectInput) {
                formSubjectInput.value = subject;
            }

            if (formError) {
                formError.classList.add('hidden');
            }

            if (selectedFile) {
                const hasValidType = allowedFileTypes.includes(selectedFile.type)
                    || /\.(pdf|doc|docx)$/i.test(selectedFile.name);

                if (!hasValidType || selectedFile.size > maxFileSizeBytes) {
                    if (formError) {
                        formError.classList.remove('hidden');
                    }
                    resetSubmitButton();
                    return;
                }
            }

            pendingIframeResponse = true;
            assessmentForm.submit();
        });
    }

    // Reset Form function (global)
    window.resetForm = () => {
        assessmentForm.reset();
        assessmentForm.classList.remove('hidden');
        formSuccess.classList.add('hidden');
        if (formError) {
            formError.classList.add('hidden');
        }
        if (fileInputText) {
            fileInputText.innerText = defaultFileText;
            fileInputText.style.color = '';
        }
    };

    // 6. Smooth Scroll for all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            e.preventDefault();
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 7. CV File Input Listener
    if (fileInput && fileInputText) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                fileInputText.innerText = fileInput.files[0].name;
                fileInputText.style.color = '#1A1A1A';
            } else {
                fileInputText.innerText = defaultFileText;
                fileInputText.style.color = '';
            }
        });
    }

    // 8. Language Switcher Logic
    const langLinks = document.querySelectorAll('[data-lang]');

    // Function to get cookie
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // Function to set language cookie
    function setLanguage(lang) {
        // Remove existing cookie first
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" + document.domain;
        
        // Set new cookie
        const cookieValue = lang === 'en' ? '' : `/auto/${lang}`;
        document.cookie = `googtrans=${cookieValue}; path=/`;
        
        // Final fallback for domain-specific cookies if needed
        if (lang !== 'en') {
            document.cookie = `googtrans=${cookieValue}; path=/; domain=${window.location.hostname}`;
        }
        
        location.reload();
    }

    // Update UI based on current cookie
    const currentTrans = getCookie('googtrans');
    let currentLangCode = 'en';

    if (currentTrans) {
        const parts = currentTrans.split('/');
        currentLangCode = parts[parts.length - 1];
    }



    // Update active states
    langLinks.forEach(link => {
        const lang = link.getAttribute('data-lang');
        if (lang === currentLangCode) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const selectedLang = link.getAttribute('data-lang');
            if (selectedLang !== currentLangCode) {
                setLanguage(selectedLang);
            }
        });
    });

    // 9. Click-to-Toggle for Language Switchers
    const floatingSwitcher = document.querySelector('.lang-switcher-floating');
    const mobileLangHeader = document.querySelector('.mobile-lang-header');
    const mobileLangNav = document.querySelector('.mobile-lang-nav');

    if (floatingSwitcher) {
        const langBtn = floatingSwitcher.querySelector('.lang-btn');
        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            floatingSwitcher.classList.toggle('active');
        });
    }

    if (mobileLangHeader && mobileLangNav) {
        mobileLangHeader.addEventListener('click', () => {
            mobileLangNav.classList.toggle('active');
        });
    }

    // Close floating switcher when clicking outside
    document.addEventListener('click', (e) => {
        if (floatingSwitcher && !floatingSwitcher.contains(e.target)) {
            floatingSwitcher.classList.remove('active');
        }
    });
});
