---- MODULE HandOfEvil ----
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Imps, Jobs, Capacity, SlapTicks

None == "none"

ImpStates == {"idle", "held"}
JobPhases == {"absent", "open", "reserved"}

VARIABLES impState, held, jobStatus, jobHolder, boost

vars == <<impState, held, jobStatus, jobHolder, boost>>

TypeOK ==
  /\ impState \in [Imps -> ImpStates]
  /\ held \in SUBSET Imps
  /\ jobStatus \in [Jobs -> JobPhases]
  /\ jobHolder \in [Jobs -> (Imps \cup {None})]
  /\ boost \in [Imps -> 0..SlapTicks]
  /\ \A i \in Imps : (impState[i] = "held") <=> (i \in held)

Init ==
  /\ impState = [i \in Imps |-> "idle"]
  /\ held = {}
  /\ jobStatus = [j \in Jobs |-> "absent"]
  /\ jobHolder = [j \in Jobs |-> None]
  /\ boost = [i \in Imps |-> 0]

Create(j) ==
  /\ jobStatus[j] = "absent"
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "open"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = None]
  /\ UNCHANGED <<impState, held, boost>>

Cancel(j) ==
  /\ jobStatus[j] \in {"open", "reserved"}
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "absent"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = None]
  /\ UNCHANGED <<impState, held, boost>>

Reserve(i, j) ==
  /\ impState[i] = "idle"
  /\ jobStatus[j] = "open"
  /\ \A k \in Jobs : jobHolder[k] # i
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "reserved"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = i]
  /\ UNCHANGED <<impState, held, boost>>

Finish(j) ==
  /\ jobStatus[j] = "reserved"
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "absent"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = None]
  /\ UNCHANGED <<impState, held, boost>>

PickUp(i) ==
  /\ i \notin held
  /\ Cardinality(held) < Capacity
  /\ impState' = [impState EXCEPT ![i] = "held"]
  /\ held' = held \cup {i}
  /\ jobStatus' = [j \in Jobs |-> IF jobHolder[j] = i THEN "open" ELSE jobStatus[j]]
  /\ jobHolder' = [j \in Jobs |-> IF jobHolder[j] = i THEN None ELSE jobHolder[j]]
  /\ boost' = [boost EXCEPT ![i] = 0]

Drop(i) ==
  /\ i \in held
  /\ impState' = [impState EXCEPT ![i] = "idle"]
  /\ held' = held \ {i}
  /\ UNCHANGED <<jobStatus, jobHolder, boost>>

Slap(i) ==
  /\ impState[i] = "idle"
  /\ boost' = [boost EXCEPT ![i] = SlapTicks]
  /\ UNCHANGED <<impState, held, jobStatus, jobHolder>>

Tick ==
  /\ boost' = [i \in Imps |-> IF boost[i] > 0 THEN boost[i] - 1 ELSE 0]
  /\ UNCHANGED <<impState, held, jobStatus, jobHolder>>

Next ==
  \/ \E j \in Jobs : Create(j)
  \/ \E j \in Jobs : Cancel(j)
  \/ \E i \in Imps, j \in Jobs : Reserve(i, j)
  \/ \E j \in Jobs : Finish(j)
  \/ \E i \in Imps : PickUp(i)
  \/ \E i \in Imps : Drop(i)
  \/ \E i \in Imps : Slap(i)
  \/ Tick

Spec == Init /\ [][Next]_vars

HandCapacity ==
  Cardinality(held) <= Capacity

HeldImpHoldsNoJob ==
  \A i \in held : \A j \in Jobs : jobHolder[j] # i

OneImpPerJob ==
  \A j \in Jobs, k \in Jobs :
    (j # k /\ jobStatus[j] = "reserved" /\ jobStatus[k] = "reserved") => jobHolder[j] # jobHolder[k]

OneJobPerWorker ==
  \A i \in Imps :
    Cardinality({j \in Jobs : jobStatus[j] = "reserved" /\ jobHolder[j] = i}) <= 1

HolderMatchesPhase ==
  \A j \in Jobs :
    /\ (jobStatus[j] = "reserved") <=> (jobHolder[j] \in Imps)
    /\ (jobStatus[j] # "reserved") => jobHolder[j] = None

BoostBounded ==
  \A i \in Imps :
    /\ boost[i] >= 0
    /\ boost[i] <= SlapTicks

HeldNeverBoostedBySlap ==
  \A i \in Imps :
    (impState[i] = "held") => boost[i] = 0
====
