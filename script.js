/*
  PlantTrack Pi - Version 1.3
  Simple script to display news updates and handle the contact form.
*/

const demoData = {
  news: [
    "PlantTrack Pi now supports multi-node sensor data collection!",
    "Our team has secured new research funding for plant tracking innovations.",
    "User base has reached 0000 members, and preview count is at 000.",
    "PlantTrack Pi celebrates its successful pilot program with university partners."
  ]
};

window.addEventListener('DOMContentLoaded', () => {
  const newsList = document.getElementById('newsList');
  demoData.news.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    newsList.appendChild(li);
  });
});

function handleSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('userName').value;
  const email = document.getElementById('userEmail').value;
  const message = document.getElementById('userMessage').value;

  console.log("Contact Form Submission:", { name, email, message });
  alert("Thank you for your message! We'll get back to you soon.");
  event.target.reset();
}
