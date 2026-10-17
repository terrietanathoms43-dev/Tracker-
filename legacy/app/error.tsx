"use client";

export default function Error({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <main className="center appErrorPage" role="main">
  <section className="card" aria-labelledby="errorTitle">
   <span className="bigIcon" aria-hidden="true">!</span>
   <h1 id="errorTitle">Trackwise couldn't load this screen</h1>
   <p className="muted">Your saved work is still stored in your organization's database. Try again or return to your workspace.</p>
   <div className="errorActions">
    <button className="primary" type="button" onClick={()=>reset()}>Try again</button>
    <a href="/">Return to Trackwise</a>
   </div>
  </section>
 </main>;
}
