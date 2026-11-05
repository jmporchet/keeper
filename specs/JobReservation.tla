---- MODULE JobReservation ----
EXTENDS FiniteSets, Naturals, TLC

CONSTANTS Jobs, Workers

VARIABLES status, holder

None == "none"

Phases == {"absent", "open", "reserved"}

vars == <<status, holder>>

TypeOK ==
  /\ status \in [Jobs -> Phases]
  /\ holder \in [Jobs -> (Workers \cup {None})]

Init ==
  /\ status = [j \in Jobs |-> "absent"]
  /\ holder = [j \in Jobs |-> None]

Create(j) ==
  /\ status[j] = "absent"
  /\ status' = [status EXCEPT ![j] = "open"]
  /\ holder' = [holder EXCEPT ![j] = None]

Cancel(j) ==
  /\ status[j] \in {"open", "reserved"}
  /\ status' = [status EXCEPT ![j] = "absent"]
  /\ holder' = [holder EXCEPT ![j] = None]

Reserve(j, w) ==
  /\ status[j] = "open"
  /\ \A k \in Jobs : holder[k] # w
  /\ status' = [status EXCEPT ![j] = "reserved"]
  /\ holder' = [holder EXCEPT ![j] = w]

Release(j) ==
  /\ status[j] = "reserved"
  /\ status' = [status EXCEPT ![j] = "open"]
  /\ holder' = [holder EXCEPT ![j] = None]

Finish(j) ==
  /\ status[j] = "reserved"
  /\ status' = [status EXCEPT ![j] = "absent"]
  /\ holder' = [holder EXCEPT ![j] = None]

Idle ==
  /\ UNCHANGED vars

Next ==
  \/ \E j \in Jobs : Create(j)
  \/ \E j \in Jobs : Cancel(j)
  \/ \E j \in Jobs, w \in Workers : Reserve(j, w)
  \/ \E j \in Jobs : Release(j)
  \/ \E j \in Jobs : Finish(j)
  \/ Idle

Spec == Init /\ [][Next]_vars

OneImpPerJob ==
  \A j \in Jobs, k \in Jobs :
    (j # k /\ status[j] = "reserved" /\ status[k] = "reserved") => holder[j] # holder[k]

OneJobPerWorker ==
  \A w \in Workers :
    Cardinality({j \in Jobs : status[j] = "reserved" /\ holder[j] = w}) <= 1

HolderMatchesPhase ==
  \A j \in Jobs :
    /\ (status[j] = "reserved") <=> (holder[j] \in Workers)
    /\ (status[j] # "reserved") => holder[j] = None
====
