import { interval, fromEvent} from 'rxjs'
import { map, scan, filter, merge, flatMap, takeUntil} from 'rxjs/operators'

function pong() {
  const canvas= document.getElementById("canvas");

  const initDirAr:Direction[]= ['SE','SW','NW','NE']; //to be used to randomly generate a ball direction
  
  type Key = 'KeyW' | 'KeyS' | 'Space'
  type Event = 'keyup' | 'keydown'
  type Direction = 'SE' | 'SW' | 'NW' | 'NE' | 'eSE' | 'eSW'| 'eNW'| 'eNE' 
  //e is for edge, which happens when the ball hits the edge of the paddle
  
  /* 
  Vec class and torusWrap function taken from asteroids.ts @ https://stackblitz.com/edit/asteroids05
  */
  class Vec {
    constructor(public readonly x: number = 0, public readonly y: number = 0) {}
    add = (b:Vec) => new Vec(this.x + b.x, this.y + b.y)
    sub = (b:Vec) => this.add(b.scale(-1))
    len = ()=> Math.sqrt(this.x*this.x + this.y*this.y)
    scale = (s:number) => new Vec(this.x*s,this.y*s)
    ortho = ()=> new Vec(this.y,-this.x)
    rotate = (deg:number) =>
              (rad =>(
                  (cos,sin,{x,y})=>new Vec(x*cos - y*sin, x*sin + y*cos)
                )(Math.cos(rad), Math.sin(rad), this)
              )(Math.PI * deg / 180)
  
    static unitVecInDirection = (deg: number) => new Vec(0,-1).rotate(deg)
    static Zero = new Vec();
  }
  const torusWrap = ({x,y}:Vec) => { 
    const s=600, 
      wrap = (v:number) => v < 0 ? v + s : v > s ? v - s : v;
    return new Vec(wrap(x),wrap(y))
  };
  /*
  RNG class taken from observableexamples.ts from tutorial week 4
  */
  class RNG {
    // LCG using GCC's constants
    m = 0x80000000// 2**31
    a = 1103515245
    c = 12345
    state:number
    constructor(seed:number) {
      this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
    }
    nextInt() {
      this.state = (this.a * this.state + this.c) % this.m;
      return this.state;
    }
    nextFloat() {
      // returns in range [0,1]
      return this.nextInt() / (this.m - 1);
    }
  }
  
  /* 
  Create and append page elements 
  (where *obj*2 means the obj belongs to the computer, *obj*1 belongs to the player )
  */
  //Create the divider
  const div = document.createElementNS(canvas.namespaceURI, "rect");
  Object.entries({
    x: 298.5, y: 35, width: 3, height:530, fill: 'white'})
    .forEach(([key,val])=>div.setAttribute(key,String(val)))

  //Create the Ball
  const ball = document.createElementNS(canvas.namespaceURI, "circle");
  Object.entries({
    cx: 300, cy: 300, r: 5, fill: 'white'})
    .forEach(([key,val])=>ball.setAttribute(key,String(val)))

  //Create Player Paddle
  const pad1 = document.createElementNS(canvas.namespaceURI, "rect");
  Object.entries({
    x: 540, y: 270, width: 10, height:60, rx: 5, fill: '#00BFFF'})
    .forEach(([key,val])=>pad1.setAttribute(key,String(val)))

  //Create Opponent(Computer) Paddle
  const pad2 = document.createElementNS(canvas.namespaceURI, "rect");
  Object.entries({
    x: 60, y: 270, width: 10, height:60, rx: 5, fill: '#B22222'})
    .forEach(([key,val])=>pad2.setAttribute(key,String(val)))

  //Create player 1 score
  const point1 = document.createElementNS(canvas.namespaceURI, "text")!;
  Object.entries({
    x: 440, y: 60, class:"score"})
    .forEach(([key,val])=>point1.setAttribute(key,String(val)))
    point1.textContent = String(0);

  //Create player 2 score
  const point2 = document.createElementNS(canvas.namespaceURI, "text")!;
  Object.entries({
    x: 140, y: 60, class:"score"})
    .forEach(([key,val])=>point2.setAttribute(key,String(val)))
    point2.textContent = String(0);

  [pad1,pad2,ball,point1,point2,div].forEach(e=>canvas.appendChild(e))
  
  /* 
  Create observables for different keyboard events, where on each triggered event, 
  returns a number to be used to adjust the player/user's paddle's y-coordinate in reduceState function
  */
  const keyObservable = <T>(e:Event, k:Key, result:()=>T)=>
      fromEvent<KeyboardEvent>(document,e).pipe(
        filter(({code})=>code === k),
        filter(({repeat})=>!repeat),
        flatMap(d=>interval(5).pipe(
            takeUntil(fromEvent<KeyboardEvent>(document, "keyup").pipe(
            filter(({code})=>code === d.code))),
            map(_=>d))),
        map(result))
        
  const startMoveUp = keyObservable('keydown','KeyW',()=>-3),
        stopMoveUp = keyObservable('keyup','KeyW',()=>0),
        startMoveDown = keyObservable('keydown','KeyS',()=>3),
        stopMoveDown = keyObservable('keyup','KeyS',()=>0);
  
  /*
  Create immutable types Body and State, 
  and an initialState with some elements' functions that shows their initial state
  */
  type Body = Readonly<{
    height:number, 
    pos:Vec 
  }>          
  type State = Readonly<{
    pad1:Body,
    pad2:Body,
    ball:Body,
    ballDirection: Direction, //the ball's movement direction
    score1:number,
    score2:number,
    matchOver: boolean,
    gameOver:boolean,
    seed: number,
    rng: RNG // a simple, seedable, pseudo-random number generator
  }>
  
  function createPad1():Body{
    return {
      height: 60,
      pos: new Vec(540,270)
    }
  }
  function createPad2():Body{
    return {
      height: 60,
      pos: new Vec(60,270)
    }
  }
  function createBall():Body{
    return {
      height:5,
      pos: new Vec(300,300)
    }
  }
  const initialState:State = {
    pad1: createPad1(),
    pad2: createPad2(),
    ball: createBall(),
    ballDirection: 'NE',
    score1:0,
    score2:0,
    matchOver:false,
    gameOver:false,
    seed:1,
    rng: new RNG(1)
    };
  
  const newState = (state:State, obvNum:number, posNum:number):State => {
    const 
    /* 
    To check the respective functions using the bodies' position (x and y-coordinates)
    (Wall2 is the computer's wall (left), Wall1 is the player's wall (right))
    */
    ballHitsWall2 = (b:Body) => b.pos.x <= 5, //ball radius is 5, so if b.pos.x reaches 5 it touches the wall
    ballHitsWall1 =(b:Body) => b.pos.x >= 595,

    ballHitsPad1 = (b:Body, p:Body) =>
        (b.pos.x >= p.pos.x && b.pos.x<=p.pos.x+10) && (b.pos.y>=p.pos.y && b.pos.y<=p.pos.y+p.height),
    edge = (b:Body, p:Body) => 
        (b.pos.y >=p.pos.y && b.pos.y <=p.pos.y+15) || (b.pos.y >=p.pos.y+45 && b.pos.y<=p.pos.y+60),
    ballHitsPad2 = (b:Body, p:Body) =>
        (b.pos.x <=  p.pos.x+10 && b.pos.x >=p.pos.x) && (b.pos.y>=p.pos.y && b.pos.y<=p.pos.y+p.height),

    ballHitsTopWall = (b:Body) => b.pos.y <= 5,
    ballHitsBotWall = (b:Body) => b.pos.y >= 595,

    /*
    Find the ball's next direction by checking its previous direction, and whether it 
    hits a paddle, a paddle edge or a wall. Ifit hits neither, return back its original direction.
    We can also see here that if the ball hits an edge, the returned direction is e'Dir'
    */
    findDirection = (s:State, dir:Direction):Direction => {  
      return dir ==='NE'? (ballHitsTopWall(s.ball)? 'SE' :ballHitsPad1(s.ball,s.pad1)? (edge(s.ball,s.pad1)?'eNW':'NW'):'NE'):
       dir === 'SE' ? (ballHitsBotWall(s.ball)? 'NE' : ballHitsPad1(s.ball,s.pad1)? (edge(s.ball,s.pad1)?'eSW':'SW') : 'SE') : 
       dir === 'NW' ? (ballHitsTopWall(s.ball)? 'SW' : ballHitsPad2(s.ball,s.pad2)? 'NE' : 'NW'):
       dir ==='eNW' ? (ballHitsTopWall(s.ball)? 'eSW' : ballHitsPad2(s.ball,s.pad2)? 'NE' : 'eNW'):
       dir === 'eSW' ?(ballHitsBotWall(s.ball)? 'eNW' : ballHitsPad2(s.ball,s.pad2) ? 'SE' : 'eSW'):
       ballHitsBotWall(s.ball)? 'NW' : ballHitsPad2(s.ball,s.pad2) ? 'SE' : 'SW';  //for 'SW'
      },

    /*
    Find the ball's next position using its next direction found from above, and adjust its 
    position with 'value'. 'Value' would be more if the ball hits the edge of the paddle
    (direction 'eNW' and 'eSW') 
    */
   findNextPosition = (s:State, nextDir:Direction,value:number):Vec =>{
      return nextDir === 'NE' ? 
        new Vec(s.ball.pos.x+value,s.ball.pos.y-value):
      nextDir==='SE'? 
        new Vec(s.ball.pos.x+value,s.ball.pos.y+value):
      nextDir==='SW'?
        new Vec(s.ball.pos.x-value,s.ball.pos.y+value):
      nextDir === 'NW'?
        new Vec(s.ball.pos.x-value,s.ball.pos.y-value):
      nextDir ==='eNW'? 
        new Vec(s.ball.pos.x-(value+0.5),s.ball.pos.y-(value+0.5)):
        new Vec(s.ball.pos.x-(value+0.5),s.ball.pos.y+(value+0.5))
    }

  /*
  Finally returns a new state with all updated information
  */
  return { 
    ...state,
      pad1:{...state.pad1, pos:torusWrap(new Vec(state.pad1.pos.x,state.pad1.pos.y+obvNum))},
      ball:{...state.ball, pos:findNextPosition(state,findDirection(state,state.ballDirection),posNum)},
      ballDirection:findDirection(state,state.ballDirection),
      pad2:{...state.pad2, pos: new Vec(state.pad2.pos.x, 0.7*state.ball.pos.y)},
      /* For a perfect AI opponent that keeps on following the ball no matter how:
       pad2:{...state.pad2, pos: new Vec(state.pad2.pos.x, state.ball.pos.y-30)}, */
      score1:ballHitsWall2(state.ball)? state.score1+1: state.score1,
      score2:ballHitsWall1(state.ball)? state.score2+1: state.score2,
      matchOver: ballHitsWall1(state.ball) || ballHitsWall2(state.ball),
      gameOver: state.score1 >=7 || state.score2 >=7,
      seed: state.seed +1,
      rng: new RNG(state.seed)
      }
  }

const reduceState= (state:State, obvNum:number):State =>{ 
  /*
  If a player hits the other's wall, a match is over. Hence put everything back to its normal position,
  keeping the scores, and use rng to generate a random value, to find a random direction from the direction array
  */
  return state.matchOver? {
    ...state,
    pad1: createPad1(),
    pad2:createPad2(),
    ball:createBall(),
    ballDirection:initDirAr[Math.floor(state.rng.nextFloat()* initDirAr.length)],
    matchOver:false
    }:
    /*
    Else,
    If one of the player reaches more than score of 3, the ball would increase speed,
    ie the 'value' in the above findNextPosition function would be 0.8; else it's 0.5.
    This also says that the ball's initial velocity would be 0.5.
    (obvNum is the number returned from the observable stream, to move the player paddle)
    */
    (state.score1>3 || state.score2>3)? 
        newState(state, obvNum, 0.8): newState(state, obvNum, 0.5)
    };
  
  /*
  Merges all different inputs from the observables, and updates the state of the game
  */
  const subscription = startMoveUp.pipe(
    merge(stopMoveUp,stopMoveDown,startMoveDown),
    scan(reduceState,initialState)
  ).subscribe(updateView)

  /*
  Each newly updated state would have its updates reflected on the respective elements in here 
  */
  function updateView(s:State):void{
    //attr function taken from asteroids.ts
    const attr = (e:Element,o:any) =>
      { for(const k in o) e.setAttribute(k,String(o[k])) };

    /*
    Updates the position of pad1, ball and pad2, and the scores
    */
    attr(pad1, {'y':s.pad1.pos.y});
    attr(ball, {'cx':s.ball.pos.x,'cy':s.ball.pos.y})
    attr(pad2, {'y':s.pad2.pos.y}) 

    //Update scores on HTML Score board
    document.getElementById("score1")!.innerHTML = String(s.score1);
    document.getElementById("score2")!.innerHTML = String(s.score2);

    //Update scores inside the canvas itself
    canvas.removeChild(point1)
    point1.textContent = String(s.score1);
    canvas.appendChild(point1)

    canvas.removeChild(point2)
    point2.textContent = String(s.score2);
    canvas.appendChild(point2)

    //A reference from asteroids.ts
    /*
    If a player reaches 7 points, the game is over, we unsubscribe 'subscription',
    and add some messages on the screen indicating some indicating who wins and instructions to restart.
    */
    if(s.gameOver) {
      subscription.unsubscribe();
      //add the messages
      const text = document.createElementNS(canvas.namespaceURI, "text")!;
      const text2 = document.createElementNS(canvas.namespaceURI, "text")!;
      const winner = document.createElementNS(canvas.namespaceURI, "text")!;
      attr(text,{x:160,y:300,class:"gameover"});
      text.textContent = "Game Over";

      attr(text2,{x:160,y:380,class:"playagain"});
      text2.textContent = "Press 'Spacebar' to play again";

      attr(winner,{x:210,y:340,class:"winner"});
      winner.textContent = s.score1>s.score2? "You Win!" : "Opponent Wins";
      [text,text2,winner].forEach(e=>canvas.appendChild(e));
      
      /*
      An observable waiting for the player's key press of the spacebar to restart the game.
      To restart, just remove all appended elements from the canvas, reset the scores on HTML,
      and call pong().
      */
      const restartGame = fromEvent<KeyboardEvent>(document,'keydown').pipe(
        filter(({code})=>code==='Space'),
        map(key => key.preventDefault())).
        subscribe(_=>{
          [pad1,pad2,ball,div,text,text2,point1,point2,winner].forEach(e=>canvas.removeChild(e)),
        document.getElementById("score1")!.innerHTML = String(0);
        document.getElementById("score2")!.innerHTML = String(0);
        pong()})
      } 
  }

}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    pong();
  }