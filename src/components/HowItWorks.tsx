/*
  HowItWorks explains the booking process on the public homepage.

  In Version 5:
    - visible text uses TranslatedText for English/Dutch support
    - layout classes are stored in howItWorksStyles
*/

import { TranslatedText } from "@/components/TranslatedText";
import { howItWorksStyles } from "@/styles/classNames";

export default function HowItWorks() 
{
  return (
    <section id="how-it-works" className={howItWorksStyles.section}>
      <div className={howItWorksStyles.container}>
        <div className={howItWorksStyles.intro}>
          <p className={howItWorksStyles.label}> <TranslatedText sectionName="howItWorks" textKey="label" /> </p>
          <h2 className={howItWorksStyles.title}> <TranslatedText sectionName="howItWorks" textKey="title" /> </h2>
          <p className={howItWorksStyles.description}> <TranslatedText sectionName="howItWorks" textKey="description" /> </p>
        </div>

        <div className={howItWorksStyles.stepGrid}>
          <div className={howItWorksStyles.stepCard}>
            <div className={howItWorksStyles.stepNumber}> 1 </div>
            <h3 className={howItWorksStyles.stepTitle}> <TranslatedText sectionName="howItWorks" textKey="stepOneTitle" /> </h3>
            <p className={howItWorksStyles.stepDescription}> <TranslatedText sectionName="howItWorks" textKey="stepOneDescription" /> </p>
          </div>

          <div className={howItWorksStyles.stepCard}>
            <div className={howItWorksStyles.stepNumber}> 2 </div>
            <h3 className={howItWorksStyles.stepTitle}> <TranslatedText sectionName="howItWorks" textKey="stepTwoTitle" /> </h3>
            <p className={howItWorksStyles.stepDescription}> <TranslatedText sectionName="howItWorks" textKey="stepTwoDescription" /> </p>
          </div>

          <div className={howItWorksStyles.stepCard}>
            <div className={howItWorksStyles.stepNumber}> 3 </div>
            <h3 className={howItWorksStyles.stepTitle}> <TranslatedText sectionName="howItWorks" textKey="stepThreeTitle" /> </h3>
            <p className={howItWorksStyles.stepDescription}> <TranslatedText sectionName="howItWorks" textKey="stepThreeDescription" /> </p>
          </div>
        </div>
      </div>
    </section>
  );
}